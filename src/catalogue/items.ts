import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type FieldValue,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { catalogue, core } from 'data-platform'
import type { CategoryRecord } from './categories.ts'
import { reportWriteRejection } from './writeRejections.ts'

export interface ItemRecord extends core.Item, catalogue.CatalogueItem {
  id: core.ItemId
}

/** Whether `item`'s name contains `search`, ignoring case and surrounding whitespace; every Item matches an empty search. */
export function matchesName(item: ItemRecord, search: string): boolean {
  return item.name.toLowerCase().includes(search.trim().toLowerCase())
}

export interface ItemInput {
  name: string
  brandNote?: string
  categoryId: catalogue.CategoryId
  necessity: catalogue.Necessity
  shopId?: catalogue.ShopId
}

/** What adding an Item carries: its fields, plus a Barcode it carries from the start. */
export interface NewItemInput extends ItemInput {
  barcode?: core.Barcode
}

/** What saving an edit to an Item carries: its fields, plus the Barcodes the Member removed. */
export interface ItemEdit extends ItemInput {
  removedBarcodes?: core.Barcode[]
}

function toItemRecord(id: core.ItemId, item: core.Item, catalogueItem: catalogue.CatalogueItem): ItemRecord {
  return { id, ...item, ...catalogueItem }
}

/** The Items among core `items` docs, each with its id; a document failing its schema is logged and left out. */
function parseCoreItemDocs(docs: readonly QueryDocumentSnapshot[]): (core.Item & { id: core.ItemId })[] {
  return docs.flatMap((snapshotDoc) => {
    const parsed = core.itemSchema.safeParse(snapshotDoc.data())
    if (!parsed.success) {
      console.error(`Skipping invalid Item document ${snapshotDoc.id}`, parsed.error)
      return []
    }
    return [{ id: core.itemId(snapshotDoc.id), ...parsed.data }]
  })
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
 * failing its schema — is left out of the list rather than shown incomplete, as is an Item
 * soft-deleted on either doc (`deletedAt` set). Returns the unsubscribe function that stops both
 * underlying subscriptions.
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
      if (
        catalogueItem !== undefined &&
        item.deletedAt === undefined &&
        catalogueItem.deletedAt === undefined
      ) {
        records.push(toItemRecord(id, item, catalogueItem))
      }
    }
    callback(records)
  }

  const unsubscribeItems = onSnapshot(query(collection(db, core.ITEMS_COLLECTION), orderBy('name')), (snapshot) => {
    coreItems = new Map(parseCoreItemDocs(snapshot.docs).map((item) => [item.id, item] as const))
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
 * generated id, as one batch. A new Item always starts at State `enough`, carrying `barcode`
 * when given. The batch also bumps the referenced Category's referenceCount, and the Shop
 * override's when set, matching the platform's create rule. Resolves once the batch is queued,
 * not once Firestore acknowledges it, so a caller offline is not left waiting; a batch the
 * server later rejects is reported through {@link reportWriteRejection}.
 */
export async function createItem(db: Firestore, input: NewItemInput): Promise<void> {
  const item = core.itemSchema.parse({
    name: input.name,
    state: 'enough',
    ...(input.brandNote !== undefined ? { brandNote: input.brandNote } : {}),
    ...(input.barcode !== undefined ? { barcodes: [input.barcode] } : {}),
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
 * references being moved away from. Any `removedBarcodes` leave the Item's `barcodes` in the same
 * batch with `arrayRemove`, leaving its other Barcodes. Resolves once the batch is queued, see {@link createItem}.
 */
export async function updateItem(db: Firestore, previous: ItemRecord, input: ItemEdit): Promise<void> {
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
  batch.update(doc(db, core.ITEMS_COLLECTION, previous.id), {
    name,
    brandNote: brandNote ?? deleteField(),
    ...(input.removedBarcodes?.length ? { barcodes: arrayRemove(...input.removedBarcodes) } : {}),
  })
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
 * cache when offline. Empty when none does; a soft-deleted Item (`deletedAt` set) is not found.
 * Only the core half is returned, so an Item whose catalogue half has not synced yet is found here
 * though {@link watchItems} does not emit it; a document failing its schema is left out.
 */
export async function findItemsByBarcode(
  db: Firestore,
  barcode: core.Barcode,
): Promise<(core.Item & { id: core.ItemId })[]> {
  const snapshot = await getDocs(
    query(collection(db, core.ITEMS_COLLECTION), where('barcodes', 'array-contains', barcode)),
  )
  return parseCoreItemDocs(snapshot.docs).filter((item) => item.deletedAt === undefined)
}

/**
 * The soft-deleted Item (`deletedAt` set on its core doc) whose `barcodes` contain `barcode`, joined
 * with its catalogue half so it can be restored. Undefined when none does, or when its catalogue doc
 * is missing or fails its schema. With several, the first the query returns. Answered from the local
 * cache when offline.
 */
export async function findDeletedItemByBarcode(db: Firestore, barcode: core.Barcode): Promise<ItemRecord | undefined> {
  const snapshot = await getDocs(
    query(collection(db, core.ITEMS_COLLECTION), where('barcodes', 'array-contains', barcode)),
  )
  for (const item of parseCoreItemDocs(snapshot.docs).filter((found) => found.deletedAt !== undefined)) {
    const catalogueSnapshot = await getDoc(doc(db, catalogue.CATALOGUE_ITEMS_COLLECTION, item.id))
    if (!catalogueSnapshot.exists()) continue
    const parsed = catalogue.catalogueItemSchema.safeParse(catalogueSnapshot.data())
    if (!parsed.success) {
      console.error(`Skipping invalid CatalogueItem document ${item.id}`, parsed.error)
      continue
    }
    const { id, ...coreItem } = item
    return toItemRecord(id, coreItem, parsed.data)
  }
  return undefined
}

/**
 * Validates `barcode` with {@link core.barcode}, which throws naming it, before adding it to the Item's
 * `barcodes` with `arrayUnion`, so attaching one the Item already carries changes nothing.
 * Resolves once the write is queued, see {@link createItem}.
 */
export async function attachBarcode(
  db: Firestore,
  item: Pick<ItemRecord, 'id' | 'name'>,
  barcode: string,
): Promise<void> {
  const validBarcode = core.barcode(barcode)

  void updateDoc(doc(db, core.ITEMS_COLLECTION, item.id), { barcodes: arrayUnion(validBarcode) }).catch(
    (err: unknown) => {
      reportWriteRejection(`barcode change for ${item.name}`, err)
    },
  )
}

/**
 * Removes `barcode` from the Item's `barcodes` with `arrayRemove`, leaving its other barcodes.
 * Resolves once the write is queued, see {@link createItem}.
 */
export async function removeBarcode(
  db: Firestore,
  item: Pick<ItemRecord, 'id' | 'name'>,
  barcode: core.Barcode,
): Promise<void> {
  void updateDoc(doc(db, core.ITEMS_COLLECTION, item.id), { barcodes: arrayRemove(barcode) }).catch(
    (err: unknown) => {
      reportWriteRejection(`barcode removal for ${item.name}`, err)
    },
  )
}

/**
 * One batch moving an Item in or out of the soft-deleted state: `deletedAt` on its core and catalogue
 * docs, and the referenceCount of its Category, and of its Shop override when set, by `delta`.
 * Shared by {@link softDeleteItem} and {@link restoreItem} so the counts they move stay in step.
 */
function commitItemDeletion(
  db: Firestore,
  item: ItemRecord,
  deletedAt: FieldValue,
  delta: 1 | -1,
  rejectionLabel: string,
): void {
  const batch = writeBatch(db)
  batch.update(doc(db, core.ITEMS_COLLECTION, item.id), { deletedAt })
  batch.update(doc(db, catalogue.CATALOGUE_ITEMS_COLLECTION, item.id), { deletedAt })
  batch.update(doc(db, catalogue.CATEGORIES_COLLECTION, item.categoryId), { referenceCount: increment(delta) })
  if (item.shopId !== undefined) {
    batch.update(doc(db, catalogue.SHOPS_COLLECTION, item.shopId), { referenceCount: increment(delta) })
  }
  void batch.commit().catch((err: unknown) => {
    reportWriteRejection(`${rejectionLabel} ${item.name}`, err)
  })
}

/**
 * Soft-deletes the Item: one batch sets `deletedAt` on its core and catalogue docs and lowers the
 * referenceCount of its Category, and of its Shop override when set. `stateHistory` is left
 * untouched, so {@link restoreItem} brings the Item back whole. Resolves once the batch is queued,
 * see {@link createItem}; unlike `deleteCategory` and `deleteShop` it never throws.
 */
export async function softDeleteItem(db: Firestore, item: ItemRecord): Promise<void> {
  commitItemDeletion(db, item, serverTimestamp(), -1, 'deleted Item')
}

/**
 * Undoes {@link softDeleteItem}: clears `deletedAt` on both docs and raises the same referenceCounts
 * back. Undo can fail: the delete frees the Category and Shop for deletion, and `deleteCategory` and
 * `deleteShop` hard-delete the doc, so a restore after that is refused, the Item stays deleted and
 * only the write-rejection banner says so.
 */
export async function restoreItem(db: Firestore, item: ItemRecord): Promise<void> {
  commitItemDeletion(db, item, deleteField(), 1, 'restored Item')
}
