import {
  collection,
  deleteField,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
  type Firestore,
  type WriteBatch,
} from 'firebase/firestore'
import { catalogue } from 'data-platform'
import { reportFailure, reportWriteRejection } from './writeRejections.ts'
import { isLiveReference } from './items.ts'
import type { ShopRecord } from './shops.ts'

export interface CategoryRecord extends catalogue.Category {
  id: catalogue.CategoryId
}

/** A Category's name and default Shop as typed in a form, before validation. */
export interface CategoryDraft {
  name: string
  shopId: string
}

/** The trimmed name and the default Shop, or the message to show and the field it belongs to; the Shop must be one currently in `shops`. */
export function validateCategoryDraft(
  draft: CategoryDraft,
  shops: ShopRecord[],
): { name: string; shopId: catalogue.ShopId } | { error: string; field: keyof CategoryDraft } {
  const name = draft.name.trim()
  if (name.length === 0) return { error: 'A Category needs a name.', field: 'name' }
  const shop = shops.find((candidate) => candidate.id === draft.shopId)
  if (shop === undefined) return { error: 'Choose a default Shop.', field: 'shopId' }
  return { name, shopId: shop.id }
}

/** The wording for both the {@link CategoryInUseError} refusal and the Edit Category dialog's up-front note. */
export const CATEGORY_IN_USE_MESSAGE = 'This Category is still used by an Item, and cannot be deleted.'

/** Whether the cached `referenceCount` says an Item still belongs to the Category, so it cannot be deleted. */
export function isCategoryInUse(category: CategoryRecord): boolean {
  return category.referenceCount > 0
}

/** Thrown by {@link deleteCategory} while a catalogue Item still belongs to the Category. */
export class CategoryInUseError extends Error {}

function toCategoryRecord(id: string, data: catalogue.Category): CategoryRecord {
  return { id: catalogue.categoryId(id), ...data }
}

/**
 * Notifies `callback` with every Category that isn't soft-deleted (`deletedAt` unset), ordered by
 * name. A document failing {@link catalogue.categorySchema} is skipped and logged rather than
 * breaking the whole list. Returns the unsubscribe function.
 */
export function watchCategories(
  db: Firestore,
  callback: (categories: CategoryRecord[]) => void,
): () => void {
  const categoriesQuery = query(collection(db, catalogue.CATEGORIES_COLLECTION), orderBy('name'))
  return onSnapshot(categoriesQuery, (snapshot) => {
    callback(
      snapshot.docs.flatMap((snapshotDoc) => {
        const parsed = catalogue.categorySchema.safeParse(snapshotDoc.data())
        if (!parsed.success) {
          console.error(`Skipping invalid Category document ${snapshotDoc.id}`, parsed.error)
          return []
        }
        if (parsed.data.deletedAt !== undefined) return []
        return [toCategoryRecord(snapshotDoc.id, parsed.data)]
      }),
    )
  })
}

/** Commits `batch` without awaiting it; a rejection is reported through {@link reportWriteRejection} as `what`. */
function commitQueued(batch: WriteBatch, what: string): void {
  void batch.commit().catch((err: unknown) => {
    reportWriteRejection(what, err)
  })
}

/**
 * Validates against {@link catalogue.categorySchema} before writing a new Category, starting at
 * referenceCount 0 and bumping its default Shop's referenceCount in the same batch, matching the
 * platform's create rule. Resolves with the new Category's id once the batch is queued, not once
 * Firestore acknowledges it, so a caller offline is not left waiting; a batch the server later
 * rejects is reported through {@link reportWriteRejection}.
 */
export async function createCategory(
  db: Firestore,
  name: string,
  defaultShopId: catalogue.ShopId,
): Promise<catalogue.CategoryId> {
  const data = catalogue.categorySchema.parse({ name, defaultShopId, referenceCount: 0 })
  const categoryRef = doc(collection(db, catalogue.CATEGORIES_COLLECTION))
  const batch = writeBatch(db)
  batch.set(categoryRef, data)
  batch.update(doc(db, catalogue.SHOPS_COLLECTION, defaultShopId), { referenceCount: increment(1) })
  commitQueued(batch, `new Category ${data.name}`)
  return catalogue.categoryId(categoryRef.id)
}

/** Validates the new name against {@link catalogue.categorySchema} before writing it. Resolves once queued, see {@link createCategory}. */
export async function renameCategory(
  db: Firestore,
  category: CategoryRecord,
  name: string,
): Promise<void> {
  const validName = catalogue.categorySchema.shape.name.parse(name)
  void updateDoc(doc(db, catalogue.CATEGORIES_COLLECTION, category.id), { name: validName }).catch((err: unknown) => {
    reportWriteRejection(`rename of Category ${category.name} to ${validName}`, err)
  })
}

/**
 * Moves the Category's default Shop reference from its current Shop to `defaultShopId` in one batch, as the
 * platform's rules require both Shops' `referenceCount` to move with it. A no-op when the Shop is unchanged.
 * Resolves once queued, see {@link createCategory}.
 */
export async function changeCategoryDefaultShop(
  db: Firestore,
  category: CategoryRecord,
  defaultShopId: catalogue.ShopId,
): Promise<void> {
  if (defaultShopId === category.defaultShopId) return
  const batch = writeBatch(db)
  batch.update(doc(db, catalogue.CATEGORIES_COLLECTION, category.id), { defaultShopId })
  batch.update(doc(db, catalogue.SHOPS_COLLECTION, category.defaultShopId), { referenceCount: increment(-1) })
  batch.update(doc(db, catalogue.SHOPS_COLLECTION, defaultShopId), { referenceCount: increment(1) })
  commitQueued(batch, `change of Category ${category.name}'s default Shop`)
}

/**
 * Soft-deletes the Category: sets `deletedAt` and drops its default Shop's reference in one batch.
 * Refuses up front with {@link CategoryInUseError}, writing nothing, while the cached `referenceCount`
 * is above 0; the platform's rules refuse anything that slips through, reported through
 * {@link reportWriteRejection}. Resolves once queued, see {@link createCategory}.
 */
export async function deleteCategory(db: Firestore, category: CategoryRecord): Promise<void> {
  if (isCategoryInUse(category)) throw new CategoryInUseError(CATEGORY_IN_USE_MESSAGE)
  const batch = writeBatch(db)
  batch.update(doc(db, catalogue.CATEGORIES_COLLECTION, category.id), { deletedAt: serverTimestamp() })
  batch.update(doc(db, catalogue.SHOPS_COLLECTION, category.defaultShopId), { referenceCount: increment(-1) })
  commitQueued(batch, `deleted Category ${category.name}`)
}

/**
 * Undoes {@link deleteCategory}: clears `deletedAt` and raises the default Shop's reference back in
 * one batch. Refused, writing nothing, when the default Shop is not among the live `shops`: restoring
 * onto a soft-deleted Shop would leave the Category pointing at a hidden Shop. The refusal is reported
 * through {@link reportFailure}. Resolves once queued, see {@link createCategory}.
 */
export async function restoreCategory(
  db: Firestore,
  category: CategoryRecord,
  shops: readonly Pick<ShopRecord, 'id'>[],
): Promise<void> {
  if (!isLiveReference(shops, category.defaultShopId)) {
    reportFailure(`Could not restore ${category.name}`, new Error('Its default Shop has been deleted'))
    return
  }
  const batch = writeBatch(db)
  batch.update(doc(db, catalogue.CATEGORIES_COLLECTION, category.id), { deletedAt: deleteField() })
  batch.update(doc(db, catalogue.SHOPS_COLLECTION, category.defaultShopId), { referenceCount: increment(1) })
  commitQueued(batch, `restored Category ${category.name}`)
}
