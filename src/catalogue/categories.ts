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

/** Notifies `callback` with every Category, ordered by name. Returns the unsubscribe function. */
export function watchCategories(
  db: Firestore,
  callback: (categories: CategoryRecord[]) => void,
): () => void {
  const categoriesQuery = query(collection(db, catalogue.CATEGORIES_COLLECTION), orderBy('name'))
  return onSnapshot(categoriesQuery, (snapshot) => {
    callback(
      snapshot.docs.map((snapshotDoc) => toCategoryRecord(snapshotDoc.id, snapshotDoc.data() as catalogue.Category)),
    )
  })
}

/** Validates against {@link catalogue.categorySchema} before writing a new Category. */
export async function createCategory(
  db: Firestore,
  name: string,
  defaultShopId: catalogue.ShopId,
): Promise<void> {
  const data = catalogue.categorySchema.parse({ name, defaultShopId })
  await addDoc(collection(db, catalogue.CATEGORIES_COLLECTION), data)
}

/** Validates the new name against {@link catalogue.categorySchema} before writing it. */
export async function renameCategory(
  db: Firestore,
  id: catalogue.CategoryId,
  name: string,
): Promise<void> {
  const validName = catalogue.categorySchema.shape.name.parse(name)
  await updateDoc(doc(db, catalogue.CATEGORIES_COLLECTION, id), { name: validName })
}

/** Refuses with {@link CategoryInUseError} while any catalogue Item still belongs to this Category. */
export async function deleteCategory(db: Firestore, id: catalogue.CategoryId): Promise<void> {
  const dependents = await getDocs(
    query(collection(db, catalogue.CATALOGUE_ITEMS_COLLECTION), where('categoryId', '==', id), limit(1)),
  )
  if (!dependents.empty) {
    throw new CategoryInUseError('This Category is still used by an Item, and cannot be deleted.')
  }
  await deleteDoc(doc(db, catalogue.CATEGORIES_COLLECTION, id))
}
