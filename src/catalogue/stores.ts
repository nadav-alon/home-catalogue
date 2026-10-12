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
import type { AisleRecord } from './aisles.ts'
import { reportWriteRejection } from './writeRejections.ts'

export interface StoreRecord extends catalogue.Store {
  id: catalogue.StoreId
}

/**
 * Notifies `callback` with every Store that isn't soft-deleted (`deletedAt` unset), ordered by name,
 * whichever Shop it is under; a caller shows the Stores of the Shops it shows. A document failing
 * {@link catalogue.storeSchema} is skipped and logged. Returns the unsubscribe function.
 */
export function watchStores(db: Firestore, callback: (stores: StoreRecord[]) => void): () => void {
  const storesQuery = query(collection(db, catalogue.STORES_COLLECTION), orderBy('name'))
  return onSnapshot(storesQuery, (snapshot) => {
    callback(
      snapshot.docs.flatMap((snapshotDoc) => {
        const parsed = catalogue.storeSchema.safeParse(snapshotDoc.data())
        if (!parsed.success) {
          console.error(`Skipping invalid Store document ${snapshotDoc.id}`, parsed.error)
          return []
        }
        if (parsed.data.deletedAt !== undefined) return []
        return [{ id: catalogue.storeId(snapshotDoc.id), ...parsed.data }]
      }),
    )
  })
}

/**
 * Validates against {@link catalogue.storeSchema} before writing a new Store under `shopId` with an
 * empty aisle order, and resolves with its id once the write is queued, not once Firestore
 * acknowledges it; a write the server later rejects is reported through {@link reportWriteRejection}.
 */
export async function createStore(db: Firestore, shopId: catalogue.ShopId, name: string): Promise<catalogue.StoreId> {
  const data = catalogue.storeSchema.parse({ name, shopId, aisleOrder: [] })
  const storeRef = doc(collection(db, catalogue.STORES_COLLECTION))
  void setDoc(storeRef, data).catch((err: unknown) => {
    reportWriteRejection(`new Store ${data.name}`, err)
  })
  return catalogue.storeId(storeRef.id)
}

/** Validates the new name against {@link catalogue.storeSchema} before writing it. Resolves once queued, see {@link createStore}. */
export async function renameStore(db: Firestore, store: StoreRecord, name: string): Promise<void> {
  const validName = catalogue.storeSchema.shape.name.parse(name)
  commitStoreUpdate(db, store, { name: validName }, `rename of Store ${store.name} to ${validName}`)
}

/**
 * Writes `aisleOrder` as the Store's whole order: the Aisles in the order one walks them. Aisles
 * left out are unplaced. Resolves once queued, see {@link createStore}.
 */
export async function setAisleOrder(db: Firestore, store: StoreRecord, aisleOrder: readonly catalogue.AisleId[]): Promise<void> {
  const validOrder = catalogue.storeSchema.shape.aisleOrder.parse(aisleOrder)
  commitStoreUpdate(db, store, { aisleOrder: validOrder }, `aisle order of Store ${store.name}`)
}

/** Soft-deletes the Store by setting `deletedAt` to the server's commit time. Resolves once queued, see {@link createStore}. */
export async function softDeleteStore(db: Firestore, store: StoreRecord): Promise<void> {
  commitStoreUpdate(db, store, { deletedAt: serverTimestamp() }, `deleted Store ${store.name}`)
}

/** Brings a soft-deleted Store back by clearing `deletedAt`. Resolves once queued, see {@link createStore}. */
export async function restoreStore(db: Firestore, store: StoreRecord): Promise<void> {
  commitStoreUpdate(db, store, { deletedAt: deleteField() }, `restored Store ${store.name}`)
}

/** The fields of a Store document an update may write, each checked against {@link catalogue.Store}. */
type StoreFields = Partial<Pick<catalogue.Store, 'name' | 'aisleOrder'>> | { deletedAt: FieldValue }

function commitStoreUpdate(db: Firestore, store: StoreRecord, fields: StoreFields, what: string): void {
  void updateDoc(doc(db, catalogue.STORES_COLLECTION, store.id), fields).catch((err: unknown) => {
    reportWriteRejection(what, err)
  })
}

/** The live Aisles split by a Store's order: `placed` in the order one walks them, then `unplaced`, which the order has not reached, by name. */
export interface ArrangedAisles {
  placed: AisleRecord[]
  unplaced: AisleRecord[]
}

/** Splits `aisles` by `aisleOrder`. An id in the order that no live Aisle has (deleted since) is left out. */
export function arrangeAisles(aisles: readonly AisleRecord[], aisleOrder: readonly catalogue.AisleId[]): ArrangedAisles {
  const placed = aisleOrder.flatMap((id) => aisles.find((aisle) => aisle.id === id) ?? [])
  return { placed, unplaced: aisles.filter((aisle) => !placed.includes(aisle)) }
}

/** The rows of the aisle order list: the placed Aisles, then the unplaced ones. */
export function aisleRows({ placed, unplaced }: ArrangedAisles): AisleRecord[] {
  return [...placed, ...unplaced]
}

/**
 * The aisle order to save after the row at `from` is dragged or nudged to `to` in {@link aisleRows},
 * or null when the move changes nothing (`from` equals `to`, or either is outside the rows).
 * Everything up to the moved row, and up to the last row that was already placed, becomes placed; the
 * Aisles after that stay unplaced and are left out of the order.
 */
export function moveAisle(arranged: ArrangedAisles, from: number, to: number): catalogue.AisleId[] | null {
  const rows = aisleRows(arranged)
  if (from === to || from < 0 || to < 0 || from >= rows.length || to >= rows.length) return null
  const [moved] = rows.splice(from, 1)
  rows.splice(to, 0, moved)
  const placedCount = Math.max(arranged.placed.length + (from >= arranged.placed.length ? 1 : 0), to + 1)
  return rows.slice(0, placedCount).map((aisle) => aisle.id)
}

/**
 * The aisle order to save after the row at `from` in {@link aisleRows} is put at the end of the
 * placed Aisles, directly above the unplaced ones; null when `from` is outside the rows. It is the
 * only way to place the first unplaced Aisle on its own, which {@link moveAisle} cannot do.
 */
export function placeAisle({ placed, unplaced }: ArrangedAisles, from: number): catalogue.AisleId[] | null {
  const moved = [...placed, ...unplaced][from]
  if (moved === undefined) return null
  return [...placed.filter((aisle) => aisle !== moved), moved].map((aisle) => aisle.id)
}
