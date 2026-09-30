import {
  collection,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'
import { catalogue } from 'data-platform'
import { isRulesRefusal } from '../firebase/rulesRefusal.ts'
import { reportWriteRejection } from './writeRejections.ts'

export interface CategoryRecord extends catalogue.Category {
  id: catalogue.CategoryId
}

/** Thrown by {@link deleteCategory} while a catalogue Item still belongs to the Category. */
export class CategoryInUseError extends Error {}

function toCategoryRecord(id: string, data: catalogue.Category): CategoryRecord {
  return { id: catalogue.categoryId(id), ...data }
}

/**
 * Notifies `callback` with every Category, ordered by name. A document failing
 * {@link catalogue.categorySchema} is skipped and logged rather than breaking the whole list.
 * Returns the unsubscribe function.
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
        return [toCategoryRecord(snapshotDoc.id, parsed.data)]
      }),
    )
  })
}

/**
 * Validates against {@link catalogue.categorySchema} before writing a new Category, starting at
 * referenceCount 0 and bumping its default Shop's referenceCount in the same batch, matching the
 * platform's create rule. Resolves with the new Category's id once the batch is queued, not once Firestore acknowledges it,
 * so a caller offline is not left waiting; a batch the server later rejects is reported through {@link reportWriteRejection}.
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
  void batch.commit().catch((err: unknown) => {
    reportWriteRejection(`new Category ${data.name}`, err)
  })
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
  void batch.commit().catch((err: unknown) => {
    reportWriteRejection(`change of Category ${category.name}'s default Shop`, err)
  })
}

/**
 * Refuses with {@link CategoryInUseError} while any catalogue Item still belongs to this Category.
 * Enforced by the platform's Firestore rules against the Category's own `referenceCount`, so the
 * refusal holds regardless of what this device has cached. Drops the Category's own reference to
 * its default Shop in the same batch.
 */
export async function deleteCategory(db: Firestore, category: CategoryRecord): Promise<void> {
  const batch = writeBatch(db)
  batch.delete(doc(db, catalogue.CATEGORIES_COLLECTION, category.id))
  batch.update(doc(db, catalogue.SHOPS_COLLECTION, category.defaultShopId), { referenceCount: increment(-1) })
  try {
    await batch.commit()
  } catch (err) {
    if (isRulesRefusal(err)) {
      throw new CategoryInUseError('This Category is still used by an Item, and cannot be deleted.')
    }
    reportWriteRejection(`deleted Category ${category.name}`, err)
  }
}
