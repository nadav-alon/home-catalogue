import {
  collection,
  deleteField,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type FieldValue,
  type Firestore,
} from 'firebase/firestore'
import { catalogue } from 'data-platform'
import { reportWriteRejection } from './writeRejections.ts'

export interface ShopRecord extends catalogue.Shop {
  id: catalogue.ShopId
}

export const UNKNOWN_SHOP_NAME = 'Unknown Shop'

/** The Shop's display name, or {@link UNKNOWN_SHOP_NAME} when `shops` has no record for it: deleted, not yet synced, or invalid. */
export function shopName(shops: ShopRecord[], shopId: catalogue.ShopId): string {
  return shops.find((shop) => shop.id === shopId)?.name ?? UNKNOWN_SHOP_NAME
}

export const SHOP_IN_USE_MESSAGE = 'This Shop is in use, and cannot be deleted.'

/** Thrown by {@link deleteShop} when the cached `referenceCount` says the Shop is still in use. */
export class ShopInUseError extends Error {}

function toShopRecord(id: string, data: catalogue.Shop): ShopRecord {
  return { id: catalogue.shopId(id), ...data }
}

/**
 * Notifies `callback` with every Shop that isn't soft-deleted (`deletedAt` unset), ordered by name. A
 * document failing {@link catalogue.shopSchema} is skipped and logged rather than breaking the
 * whole list. Returns the unsubscribe function.
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
 * Validates against {@link catalogue.shopSchema} before writing a new Shop, and resolves with its id
 * once the write is queued, not once Firestore acknowledges it, so a caller offline is not left
 * waiting; a write the server later rejects is reported through {@link reportWriteRejection}.
 */
export async function createShop(db: Firestore, name: string): Promise<catalogue.ShopId> {
  const data = catalogue.shopSchema.parse({ name, referenceCount: 0 })
  const shopRef = doc(collection(db, catalogue.SHOPS_COLLECTION))
  void setDoc(shopRef, data).catch((err: unknown) => {
    reportWriteRejection(`new Shop ${data.name}`, err)
  })
  return catalogue.shopId(shopRef.id)
}

/** Validates the new name against {@link catalogue.shopSchema} before writing it. Resolves once queued, see {@link createShop}. */
export async function renameShop(db: Firestore, shop: ShopRecord, name: string): Promise<void> {
  const validName = catalogue.shopSchema.shape.name.parse(name)
  void updateDoc(doc(db, catalogue.SHOPS_COLLECTION, shop.id), { name: validName }).catch((err: unknown) => {
    reportWriteRejection(`rename of Shop ${shop.name} to ${validName}`, err)
  })
}

/**
 * Refuses with {@link ShopInUseError}, writing nothing, while the cached `referenceCount` is above 0;
 * the platform's rules refuse a stale count too. Otherwise soft-deletes the Shop by setting
 * `deletedAt` to the server's commit time. Resolves once the write is queued, see {@link createShop};
 * a write the rules refuse is reported through {@link reportWriteRejection}.
 */
export async function deleteShop(db: Firestore, shop: ShopRecord): Promise<void> {
  if (shop.referenceCount > 0) throw new ShopInUseError(SHOP_IN_USE_MESSAGE)
  commitShopDeletion(db, shop, serverTimestamp(), 'deleted')
}

/** Brings a soft-deleted Shop back by clearing `deletedAt`. Resolves once queued, see {@link createShop}. */
export async function restoreShop(db: Firestore, shop: ShopRecord): Promise<void> {
  commitShopDeletion(db, shop, deleteField(), 'restored')
}

/** The one write behind {@link deleteShop} and {@link restoreShop}, so the two stay in step. */
function commitShopDeletion(
  db: Firestore,
  shop: ShopRecord,
  deletedAt: FieldValue,
  label: 'deleted' | 'restored',
): void {
  void updateDoc(doc(db, catalogue.SHOPS_COLLECTION, shop.id), { deletedAt }).catch((err: unknown) => {
    reportWriteRejection(`${label} Shop ${shop.name}`, err)
  })
}
