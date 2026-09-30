import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  type Firestore,
} from 'firebase/firestore'
import { catalogue } from 'data-platform'
import { isRulesRefusal } from '../firebase/rulesRefusal.ts'
import { reportWriteRejection } from './writeRejections.ts'

export interface ShopRecord extends catalogue.Shop {
  id: catalogue.ShopId
}

export const UNKNOWN_SHOP_NAME = 'Unknown Shop'

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
 * Notifies `callback` with every live Shop (no `deletedAt`), ordered by name. A document failing
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
        if (parsed.data.deletedAt !== undefined) return []
        return [toShopRecord(snapshotDoc.id, parsed.data)]
      }),
    )
  })
}

/**
 * Validates against {@link catalogue.shopSchema} before writing a new Shop. Resolves once the
 * write is queued, not once Firestore acknowledges it, so a caller offline is not left waiting;
 * a write the server later rejects is reported through {@link reportWriteRejection}.
 */
export async function createShop(db: Firestore, name: string): Promise<void> {
  const data = catalogue.shopSchema.parse({ name, referenceCount: 0 })
  void addDoc(collection(db, catalogue.SHOPS_COLLECTION), data).catch((err: unknown) => {
    reportWriteRejection(`new Shop ${data.name}`, err)
  })
}

/** Validates the new name against {@link catalogue.shopSchema} before writing it. Resolves once queued, see {@link createShop}. */
export async function renameShop(db: Firestore, shop: ShopRecord, name: string): Promise<void> {
  const validName = catalogue.shopSchema.shape.name.parse(name)
  void updateDoc(doc(db, catalogue.SHOPS_COLLECTION, shop.id), { name: validName }).catch((err: unknown) => {
    reportWriteRejection(`rename of Shop ${shop.name} to ${validName}`, err)
  })
}

/**
 * Refuses with {@link ShopInUseError} while any Category defaults to this Shop, or any Item
 * overrides to it. Enforced by the platform's Firestore rules against the Shop's own
 * `referenceCount`, so the refusal holds regardless of what this device has cached.
 */
export async function deleteShop(db: Firestore, shop: ShopRecord): Promise<void> {
  try {
    await deleteDoc(doc(db, catalogue.SHOPS_COLLECTION, shop.id))
  } catch (err) {
    if (isRulesRefusal(err)) {
      throw new ShopInUseError('This Shop is in use, and cannot be deleted.')
    }
    reportWriteRejection(`deleted Shop ${shop.name}`, err)
  }
}
