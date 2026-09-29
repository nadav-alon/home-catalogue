import {
  arrayUnion,
  collection,
  deleteField,
  doc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'
import { catalogue, core } from 'data-platform'
import type { CategoryRecord } from './categories.ts'
import { reportWriteRejection } from './writeRejections.ts'

export interface ItemRecord extends core.Item, catalogue.CatalogueItem {
  id: core.ItemId
}

export interface ItemInput {
  name: string
  brandNote?: string
  categoryId: catalogue.CategoryId
  necessity: catalogue.Necessity
  shopId?: catalogue.ShopId
}

function toItemRecord(id: core.ItemId, item: core.Item, catalogueItem: catalogue.CatalogueItem): ItemRecord {
  return { id, ...item, ...catalogueItem }
}

/** The Item's own Shop, else its Category's default; the Item's own Shop alone when its Category isn't loaded. */
export function resolvedShopId(item: ItemRecord, category: CategoryRecord | undefined): catalogue.ShopId | undefined {
  return category !== undefined ? catalogue.resolveShop(item, category) : item.shopId
}

/** Whether an Item's State belongs on the Shopping list: `running low` or `out`. */
export function isPending(state: core.State): boolean {
  return state === 'running low' || state === 'out'
}

/**
 * Notifies `callback` with every Item whose core `items` doc and catalogue `catalogueItems` doc
 * have both synced, ordered by name. An Item missing either half — not yet written, or a document
 * failing its schema — is left out of the list rather than shown incomplete. Returns the
 * unsubscribe function that stops both underlying subscriptions.
 */
export function watchItems(db: Firestore, callback: (items: ItemRecord[]) => void): () => void {
  let coreItems = new Map<core.ItemId, core.Item>()
  let catalogueItems = new Map<core.ItemId, catalogue.CatalogueItem>()
  let coreLoaded = false
  let catalogueLoaded = false

  function emit() {
    if (!coreLoaded || !catalogueLoaded) return
    const records: ItemRecord[] = []
    for (const [id, item] of coreItems) {
      const catalogueItem = catalogueItems.get(id)
      if (catalogueItem !== undefined) {
        records.push(toItemRecord(id, item, catalogueItem))
      }
    }
    callback(records)
  }

  const unsubscribeItems = onSnapshot(query(collection(db, core.ITEMS_COLLECTION), orderBy('name')), (snapshot) => {
    coreItems = new Map(
      snapshot.docs.flatMap((snapshotDoc) => {
        const parsed = core.itemSchema.safeParse(snapshotDoc.data())
        if (!parsed.success) {
          console.error(`Skipping invalid Item document ${snapshotDoc.id}`, parsed.error)
          return []
        }
        return [[core.itemId(snapshotDoc.id), parsed.data] as const]
      }),
    )
    coreLoaded = true
    emit()
  })

  const unsubscribeCatalogueItems = onSnapshot(collection(db, catalogue.CATALOGUE_ITEMS_COLLECTION), (snapshot) => {
    catalogueItems = new Map(
      snapshot.docs.flatMap((snapshotDoc) => {
        const parsed = catalogue.catalogueItemSchema.safeParse(snapshotDoc.data())
        if (!parsed.success) {
          console.error(`Skipping invalid CatalogueItem document ${snapshotDoc.id}`, parsed.error)
          return []
        }
        return [[core.itemId(snapshotDoc.id), parsed.data] as const]
      }),
    )
    catalogueLoaded = true
    emit()
  })

  return () => {
    unsubscribeItems()
    unsubscribeCatalogueItems()
  }
}

/**
 * Validates against {@link core.itemSchema} and {@link catalogue.catalogueItemSchema} before
 * writing a new Item's two docs, core `items` plus catalogue `catalogueItems`, keyed by the same
 * generated id, as one batch. A new Item always starts at State `enough`. The batch also bumps
 * the referenced Category's referenceCount, and the Shop override's when set, matching the
 * platform's create rule. Resolves once the batch is queued, not once Firestore acknowledges it,
 * so a caller offline is not left waiting; a batch the server later rejects is reported through {@link reportWriteRejection}.
 */
export async function createItem(db: Firestore, input: ItemInput): Promise<void> {
  const item = core.itemSchema.parse({
    name: input.name,
    state: 'enough',
    ...(input.brandNote !== undefined ? { brandNote: input.brandNote } : {}),
  })
  const catalogueItem = catalogue.catalogueItemSchema.parse({
    categoryId: input.categoryId,
    necessity: input.necessity,
    ...(input.shopId !== undefined ? { shopId: input.shopId } : {}),
  })

  const itemRef = doc(collection(db, core.ITEMS_COLLECTION))
  const catalogueItemRef = doc(db, catalogue.CATALOGUE_ITEMS_COLLECTION, itemRef.id)
  const batch = writeBatch(db)
  batch.set(itemRef, item)
  batch.set(catalogueItemRef, catalogueItem)
  batch.update(doc(db, catalogue.CATEGORIES_COLLECTION, catalogueItem.categoryId), {
    referenceCount: increment(1),
  })
  if (catalogueItem.shopId !== undefined) {
    batch.update(doc(db, catalogue.SHOPS_COLLECTION, catalogueItem.shopId), { referenceCount: increment(1) })
  }
  void batch.commit().catch((err: unknown) => {
    reportWriteRejection(`new Item ${item.name}`, err)
  })
}

/**
 * Validates the new fields against {@link core.itemSchema} and {@link catalogue.catalogueItemSchema}
 * before updating an Item's two docs as one batch. State is left untouched; State changes go
 * through their own write. Omitting `brandNote` or `shopId` clears that field rather than leaving
 * it stale. When the Category or Shop override changes, the batch moves the old and new
 * referenceCount by one each, matching the platform's update rule; `previous` supplies the
 * references being moved away from. Resolves once the batch is queued, see {@link createItem}.
 */
export async function updateItem(db: Firestore, previous: ItemRecord, input: ItemInput): Promise<void> {
  const { name, brandNote } = core.itemSchema.pick({ name: true, brandNote: true }).parse({
    name: input.name,
    ...(input.brandNote !== undefined ? { brandNote: input.brandNote } : {}),
  })
  const { categoryId, necessity, shopId } = catalogue.catalogueItemSchema
    .pick({ categoryId: true, necessity: true, shopId: true })
    .parse({
      categoryId: input.categoryId,
      necessity: input.necessity,
      ...(input.shopId !== undefined ? { shopId: input.shopId } : {}),
    })

  const batch = writeBatch(db)
  batch.update(doc(db, core.ITEMS_COLLECTION, previous.id), { name, brandNote: brandNote ?? deleteField() })
  batch.update(doc(db, catalogue.CATALOGUE_ITEMS_COLLECTION, previous.id), {
    categoryId,
    necessity,
    shopId: shopId ?? deleteField(),
  })
  if (categoryId !== previous.categoryId) {
    batch.update(doc(db, catalogue.CATEGORIES_COLLECTION, previous.categoryId), { referenceCount: increment(-1) })
    batch.update(doc(db, catalogue.CATEGORIES_COLLECTION, categoryId), { referenceCount: increment(1) })
  }
  if (shopId !== previous.shopId) {
    if (previous.shopId !== undefined) {
      batch.update(doc(db, catalogue.SHOPS_COLLECTION, previous.shopId), { referenceCount: increment(-1) })
    }
    if (shopId !== undefined) {
      batch.update(doc(db, catalogue.SHOPS_COLLECTION, shopId), { referenceCount: increment(1) })
    }
  }
  void batch.commit().catch((err: unknown) => {
    reportWriteRejection(`changes to ${previous.name}`, err)
  })
}

/**
 * Validates the new State against {@link core.stateSchema} before updating the Item's `state`
 * and appending a `stateHistory` entry timestamped with {@link serverTimestamp}, as one batch.
 * Resolves once the batch is queued, see {@link createItem}.
 */
export async function setItemState(
  db: Firestore,
  item: Pick<ItemRecord, 'id' | 'name'>,
  state: core.State,
): Promise<void> {
  const validState = core.stateSchema.parse(state)

  const batch = writeBatch(db)
  batch.update(doc(db, core.ITEMS_COLLECTION, item.id), { state: validState })
  batch.set(doc(collection(db, core.stateHistoryCollectionPath(item.id))), {
    state: validState,
    at: serverTimestamp(),
  })
  void batch.commit().catch((err: unknown) => {
    reportWriteRejection(`State change for ${item.name}`, err)
  })
}

/**
 * Every Item whose core `items` doc carries `barcode` in its `barcodes`, answered from the local
 * cache when offline. Empty when none does. Only the core half is returned; a document failing
 * its schema is left out.
 */
export async function findItemsByBarcode(
  db: Firestore,
  barcode: core.Barcode,
): Promise<(core.Item & { id: core.ItemId })[]> {
  const snapshot = await getDocs(
    query(collection(db, core.ITEMS_COLLECTION), where('barcodes', 'array-contains', barcode)),
  )
  return snapshot.docs.flatMap((snapshotDoc) => {
    const parsed = core.itemSchema.safeParse(snapshotDoc.data())
    if (!parsed.success) {
      console.error(`Skipping invalid Item document ${snapshotDoc.id}`, parsed.error)
      return []
    }
    return [{ id: core.itemId(snapshotDoc.id), ...parsed.data }]
  })
}

/**
 * Validates `barcode` against {@link core.barcodeSchema} before adding it to the Item's
 * `barcodes` with `arrayUnion`, so attaching one the Item already carries changes nothing.
 * Resolves once the write is queued, see {@link createItem}.
 */
export async function attachBarcode(
  db: Firestore,
  item: Pick<ItemRecord, 'id' | 'name'>,
  barcode: string,
): Promise<void> {
  const validBarcode = core.barcodeSchema.parse(barcode)

  void updateDoc(doc(db, core.ITEMS_COLLECTION, item.id), { barcodes: arrayUnion(validBarcode) }).catch(
    (err: unknown) => {
      reportWriteRejection(`barcode for ${item.name}`, err)
    },
  )
}
