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

export interface ShopRecord extends catalogue.Shop {
  id: catalogue.ShopId
}

/** Thrown by {@link deleteShop} while a Category still defaults to the Shop. */
export class ShopInUseError extends Error {}

function toShopRecord(id: string, data: catalogue.Shop): ShopRecord {
  return { id: catalogue.shopId(id), ...data }
}

/** Notifies `callback` with every Shop, ordered by name. Returns the unsubscribe function. */
export function watchShops(db: Firestore, callback: (shops: ShopRecord[]) => void): () => void {
  const shopsQuery = query(collection(db, catalogue.SHOPS_COLLECTION), orderBy('name'))
  return onSnapshot(shopsQuery, (snapshot) => {
    callback(snapshot.docs.map((snapshotDoc) => toShopRecord(snapshotDoc.id, snapshotDoc.data() as catalogue.Shop)))
  })
}

/** Validates against {@link catalogue.shopSchema} before writing a new Shop. */
export async function createShop(db: Firestore, name: string): Promise<void> {
  const data = catalogue.shopSchema.parse({ name })
  await addDoc(collection(db, catalogue.SHOPS_COLLECTION), data)
}

/** Validates the new name against {@link catalogue.shopSchema} before writing it. */
export async function renameShop(db: Firestore, id: catalogue.ShopId, name: string): Promise<void> {
  const validName = catalogue.shopSchema.shape.name.parse(name)
  await updateDoc(doc(db, catalogue.SHOPS_COLLECTION, id), { name: validName })
}

/** Refuses with {@link ShopInUseError} while any Category still defaults to this Shop. */
export async function deleteShop(db: Firestore, id: catalogue.ShopId): Promise<void> {
  const dependents = await getDocs(
    query(collection(db, catalogue.CATEGORIES_COLLECTION), where('defaultShopId', '==', id), limit(1)),
  )
  if (!dependents.empty) {
    throw new ShopInUseError('This Shop is the default Shop for a Category, and cannot be deleted.')
  }
  await deleteDoc(doc(db, catalogue.SHOPS_COLLECTION, id))
}
