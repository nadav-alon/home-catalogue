import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore'
import { catalogue } from 'data-platform'

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
 * Validates against {@link catalogue.categorySchema} before writing a new Category. Resolves once
 * the write is queued, not once Firestore acknowledges it, so a caller offline is not left
 * waiting; a write that later fails to sync is only logged.
 */
export async function createCategory(
  db: Firestore,
  name: string,
  defaultShopId: catalogue.ShopId,
): Promise<void> {
  const data = catalogue.categorySchema.parse({ name, defaultShopId })
  void addDoc(collection(db, catalogue.CATEGORIES_COLLECTION), data).catch((err: unknown) => {
    console.error('Failed to sync new Category', err)
  })
}

/** Validates the new name against {@link catalogue.categorySchema} before writing it. Resolves once queued, see {@link createCategory}. */
export async function renameCategory(
  db: Firestore,
  id: catalogue.CategoryId,
  name: string,
): Promise<void> {
  const validName = catalogue.categorySchema.shape.name.parse(name)
  void updateDoc(doc(db, catalogue.CATEGORIES_COLLECTION, id), { name: validName }).catch((err: unknown) => {
    console.error(`Failed to sync renamed Category ${id}`, err)
  })
}

/**
 * Refuses with {@link CategoryInUseError} while any catalogue Item still belongs to this Category.
 * Resolves once the delete is queued, see {@link createCategory}.
 *
 * The check only sees Items this device has already synced: one written on another member's
 * device but not yet cached here counts as "not in use".
 */
export async function deleteCategory(db: Firestore, id: catalogue.CategoryId): Promise<void> {
  const dependents = await getDocs(
    query(collection(db, catalogue.CATALOGUE_ITEMS_COLLECTION), where('categoryId', '==', id), limit(1)),
  )
  if (!dependents.empty) {
    throw new CategoryInUseError('This Category is still used by an Item, and cannot be deleted.')
  }
  void deleteDoc(doc(db, catalogue.CATEGORIES_COLLECTION, id)).catch((err: unknown) => {
    console.error(`Failed to sync deleted Category ${id}`, err)
  })
}
