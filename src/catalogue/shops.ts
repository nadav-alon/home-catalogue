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

const UNKNOWN_SHOP_NAME = 'Unknown Shop'

/** The Shop's display name, or {@link UNKNOWN_SHOP_NAME} when `shops` has no record for it: deleted, not yet synced, or invalid. */
export function shopName(shops: ShopRecord[], shopId: catalogue.ShopId): string {
  return shops.find((shop) => shop.id === shopId)?.name ?? UNKNOWN_SHOP_NAME
}

/** Thrown by {@link deleteShop} while a Category still defaults to the Shop, or an Item still overrides to it. */
export class ShopInUseError extends Error {}

function toShopRecord(id: string, data: catalogue.Shop): ShopRecord {
  return { id: catalogue.shopId(id), ...data }
}

/**
 * Notifies `callback` with every Shop, ordered by name. A document failing
 * {@link catalogue.shopSchema} is skipped and logged rather than breaking the whole list.
 * Returns the unsubscribe function.
 */
export function watchShops(db: Firestore, callback: (shops: ShopRecord[]) => void): () => void {
  const shopsQuery = query(collection(db, catalogue.SHOPS_COLLECTION), orderBy('name'))
  return onSnapshot(shopsQuery, (snapshot) => {
    callback(
      snapshot.docs.flatMap((snapshotDoc) => {
        const parsed = catalogue.shopSchema.safeParse(snapshotDoc.data())
        if (!parsed.success) {
          console.error(`Skipping invalid Shop document ${snapshotDoc.id}`, parsed.error)
          return []
        }
        return [toShopRecord(snapshotDoc.id, parsed.data)]
      }),
    )
  })
}

/**
 * Validates against {@link catalogue.shopSchema} before writing a new Shop. Resolves once the
 * write is queued, not once Firestore acknowledges it, so a caller offline is not left waiting;
 * a write that later fails to sync is only logged.
 */
export async function createShop(db: Firestore, name: string): Promise<void> {
  const data = catalogue.shopSchema.parse({ name })
  void addDoc(collection(db, catalogue.SHOPS_COLLECTION), data).catch((err: unknown) => {
    console.error('Failed to sync new Shop', err)
  })
}

/** Validates the new name against {@link catalogue.shopSchema} before writing it. Resolves once queued, see {@link createShop}. */
export async function renameShop(db: Firestore, id: catalogue.ShopId, name: string): Promise<void> {
  const validName = catalogue.shopSchema.shape.name.parse(name)
  void updateDoc(doc(db, catalogue.SHOPS_COLLECTION, id), { name: validName }).catch((err: unknown) => {
    console.error(`Failed to sync renamed Shop ${id}`, err)
  })
}

/**
 * Refuses with {@link ShopInUseError} while any Category defaults to this Shop, or any Item
 * overrides to it. Resolves once the delete is queued, see {@link createShop}.
 *
 * The check only sees Categories and Items this device has already synced: one written on
 * another member's device but not yet cached here counts as "not in use".
 */
export async function deleteShop(db: Firestore, id: catalogue.ShopId): Promise<void> {
  const [categoryDependents, itemDependents] = await Promise.all([
    getDocs(query(collection(db, catalogue.CATEGORIES_COLLECTION), where('defaultShopId', '==', id), limit(1))),
    getDocs(query(collection(db, catalogue.CATALOGUE_ITEMS_COLLECTION), where('shopId', '==', id), limit(1))),
  ])
  if (!categoryDependents.empty || !itemDependents.empty) {
    throw new ShopInUseError('This Shop is in use, and cannot be deleted.')
  }
  void deleteDoc(doc(db, catalogue.SHOPS_COLLECTION, id)).catch((err: unknown) => {
    console.error(`Failed to sync deleted Shop ${id}`, err)
  })
}
