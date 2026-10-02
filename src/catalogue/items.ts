import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteField,
  doc,
  getDocFromCache,
  getDocsFromCache,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type FieldValue,
  type DocumentSnapshot,
  type Firestore,
  type QueryDocumentSnapshot,
  type WriteBatch,
} from 'firebase/firestore'
import { catalogue, core } from 'data-platform'
import type { CategoryRecord } from './categories.ts'
import type { ShopRecord } from './shops.ts'
import { reportFailure, reportWriteRejection } from './writeRejections.ts'

export interface ItemRecord extends core.Item, catalogue.CatalogueItem {
  id: core.ItemId
}

/** A Barcode an Item carries from the start, with the holders it is moved off. */
export interface CarriedBarcode {
  value: core.Barcode
  movedOff: readonly BarcodeHolder[]
}

/** An Item that carries a Barcode, live or soft-deleted: all a move needs to name it and to take the Barcode off it. */
export type BarcodeHolder = Pick<ItemRecord, 'id' | 'name'>

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

/** What adding an Item carries: its fields, the State it starts at, plus a Barcode it carries from the start, and the Items it is moved off. */
export interface NewItemInput extends ItemInput {
  state: core.State
  barcode?: CarriedBarcode
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

/** The CatalogueItem in a catalogue `items` doc; a document failing its schema is logged and is undefined. */
function parseCatalogueItemDoc(snapshotDoc: DocumentSnapshot): catalogue.CatalogueItem | undefined {
  const parsed = catalogue.catalogueItemSchema.safeParse(snapshotDoc.data())
  if (!parsed.success) {
    console.error(`Skipping invalid CatalogueItem document ${snapshotDoc.id}`, parsed.error)
    return undefined
  }
  return parsed.data
}

/** Whether `id` names one of the live `records`; an Item without that reference (`undefined`) counts as live. */
export function isLiveReference(records: readonly { id: string }[], id: string | undefined): boolean {
  return id === undefined || records.some((record) => record.id === id)
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
        const parsed = parseCatalogueItemDoc(snapshotDoc)
        return parsed === undefined ? [] : [[core.itemId(snapshotDoc.id), parsed] as const]
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
 * generated id, as one batch. A new Item starts at `input.state`, carrying `barcode` when given,
 * which leaves each of its `movedOff` in the same batch.
 * No `stateHistory` entry is written for that starting State: the history records changes, and
 * the platform's create rule for `items` is not known to accept an initial entry. The batch also bumps the referenced Category's referenceCount, and the Shop
 * override's when set, matching the platform's create rule. Resolves with the new Item's id
 * once the batch is queued, not once Firestore acknowledges it, so a caller offline is not
 * left waiting; a batch the server later rejects is reported through {@link reportWriteRejection}.
 */
export async function createItem(db: Firestore, input: NewItemInput): Promise<core.ItemId> {
  const item = core.itemSchema.parse({
    name: input.name,
    state: input.state,
    ...(input.brandNote !== undefined ? { brandNote: input.brandNote } : {}),
    ...(input.barcode !== undefined ? { barcodes: [input.barcode.value] } : {}),
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
  if (input.barcode !== undefined) {
    moveBarcodeOff(batch, db, input.barcode.value, input.barcode.movedOff)
  }
  void batch.commit().catch((err: unknown) => {
    reportWriteRejection(`new Item ${item.name}`, err)
  })
  return core.itemId(itemRef.id)
}

/** An {@link ItemEdit} whose fields have passed {@link parseItemEdit}. */
interface ValidItemEdit {
  name: string
  brandNote: string | undefined
  categoryId: catalogue.CategoryId
  necessity: catalogue.Necessity
  shopId: catalogue.ShopId | undefined
  removedBarcodes: core.Barcode[] | undefined
}

/** Validates `edit` against {@link core.itemSchema} and {@link catalogue.catalogueItemSchema}. */
function parseItemEdit(edit: ItemEdit): ValidItemEdit {
  const { name, brandNote } = core.itemSchema.pick({ name: true, brandNote: true }).parse({
    name: edit.name,
    ...(edit.brandNote !== undefined ? { brandNote: edit.brandNote } : {}),
  })
  const { categoryId, necessity, shopId } = catalogue.catalogueItemSchema
    .pick({ categoryId: true, necessity: true, shopId: true })
    .parse({
      categoryId: edit.categoryId,
      necessity: edit.necessity,
      ...(edit.shopId !== undefined ? { shopId: edit.shopId } : {}),
    })
  return { name, brandNote, categoryId, necessity, shopId, removedBarcodes: edit.removedBarcodes }
}

/**
 * Stages the validated `edit`'s fields on the Item's two docs in `batch`, with `extraFields`
 * added to both updates. Shared by {@link updateItem} and {@link restoreItemWithEdit} so both write the same fields.
 */
function stageItemEdit(
  db: Firestore,
  batch: WriteBatch,
  id: core.ItemId,
  edit: ValidItemEdit,
  extraFields: Record<string, FieldValue>,
): void {
  const { name, brandNote, categoryId, necessity, shopId, removedBarcodes } = edit
  batch.update(doc(db, core.ITEMS_COLLECTION, id), {
    ...extraFields,
    name,
    brandNote: brandNote ?? deleteField(),
    ...(removedBarcodes?.length ? { barcodes: arrayRemove(...removedBarcodes) } : {}),
  })
  batch.update(doc(db, catalogue.CATALOGUE_ITEMS_COLLECTION, id), {
    ...extraFields,
    categoryId,
    necessity,
    shopId: shopId ?? deleteField(),
  })
}

/** The Categories' default Shops, which decide whether an edit has to be written as two batches. */
type CategoryDefaultShops = readonly Pick<CategoryRecord, 'id' | 'defaultShopId'>[]

/** Stages the referenceCount moves of an Item's Category changing from `previous` to `next`; nothing when it is unchanged. */
function stageCategoryChange(
  db: Firestore,
  batch: WriteBatch,
  previous: catalogue.CategoryId,
  next: catalogue.CategoryId,
): void {
  if (next === previous) return
  batch.update(doc(db, catalogue.CATEGORIES_COLLECTION, previous), { referenceCount: increment(-1) })
  batch.update(doc(db, catalogue.CATEGORIES_COLLECTION, next), { referenceCount: increment(1) })
}

/**
 * Whether an edit moves the Item between two Categories sharing one default Shop and also sets or
 * clears the override to that Shop. The platform refuses that as a single write, so it is written
 * as the Category move, then the override change.
 */
function movesCategoryAndOverrideOfItsDefaultShop(
  previous: ItemRecord,
  categoryId: catalogue.CategoryId,
  shopId: catalogue.ShopId | undefined,
  categories: CategoryDefaultShops,
): boolean {
  if (categoryId === previous.categoryId || shopId === previous.shopId) return false
  const from = categories.find((category) => category.id === previous.categoryId)?.defaultShopId
  const to = categories.find((category) => category.id === categoryId)?.defaultShopId
  return from !== undefined && from === to && (shopId === from || previous.shopId === from)
}

/** Stages the referenceCount moves of a Shop override changing from `previous` to `next`; nothing when it is unchanged. */
function stageShopOverrideChange(
  db: Firestore,
  batch: WriteBatch,
  previous: catalogue.ShopId | undefined,
  next: catalogue.ShopId | undefined,
): void {
  if (next === previous) return
  if (previous !== undefined) {
    batch.update(doc(db, catalogue.SHOPS_COLLECTION, previous), { referenceCount: increment(-1) })
  }
  if (next !== undefined) {
    batch.update(doc(db, catalogue.SHOPS_COLLECTION, next), { referenceCount: increment(1) })
  }
}

/**
 * Validates the new fields against {@link core.itemSchema} and {@link catalogue.catalogueItemSchema}
 * before updating an Item's two docs as one batch. State is left untouched; State changes go
 * through their own write. Omitting `brandNote` or `shopId` clears that field rather than leaving
 * it stale. When the Category or Shop override changes, the batch moves the old and new
 * referenceCount by one each, matching the platform's update rule; `previous` supplies the
 * references being moved away from. Any `removedBarcodes` leave the Item's `barcodes` in the same
 * batch with `arrayRemove`, leaving its other Barcodes. Resolves once the batch is queued, see {@link createItem}.
 * An edit moving the Item between two `categories` with the same default Shop while setting or clearing the
 * override to that Shop is written as two batches, the Category move first, since the platform refuses it as one.
 * Both are committed at once, so offline both are queued and apply in order.
 */
export async function updateItem(
  db: Firestore,
  previous: ItemRecord,
  input: ItemEdit,
  categories: CategoryDefaultShops,
): Promise<void> {
  const edit = parseItemEdit(input)
  const writeOverrideSeparately = movesCategoryAndOverrideOfItsDefaultShop(
    previous,
    edit.categoryId,
    edit.shopId,
    categories,
  )
  const batch = writeBatch(db)
  stageItemEdit(db, batch, previous.id, writeOverrideSeparately ? { ...edit, shopId: previous.shopId } : edit, {})
  stageCategoryChange(db, batch, previous.categoryId, edit.categoryId)
  if (!writeOverrideSeparately) stageShopOverrideChange(db, batch, previous.shopId, edit.shopId)
  const reportRejection = (err: unknown) => {
    reportWriteRejection(`changes to ${previous.name}`, err)
  }
  void batch.commit().catch(reportRejection)
  if (!writeOverrideSeparately) return

  const overrideBatch = writeBatch(db)
  overrideBatch.update(doc(db, catalogue.CATALOGUE_ITEMS_COLLECTION, previous.id), {
    shopId: edit.shopId ?? deleteField(),
  })
  stageShopOverrideChange(db, overrideBatch, previous.shopId, edit.shopId)
  void overrideBatch.commit().catch(reportRejection)
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

/** Every cached Item, live or soft-deleted, whose core `items` doc carries `barcode` in its `barcodes`. */
async function queryCoreItemsByBarcode(
  db: Firestore,
  barcode: core.Barcode,
): Promise<(core.Item & { id: core.ItemId })[]> {
  // A cache miss rejects, and any other failure is treated the same: no cached match, never a failed scan.
  const snapshot = await getDocsFromCache(
    query(collection(db, core.ITEMS_COLLECTION), where('barcodes', 'array-contains', barcode)),
  ).catch(() => undefined)
  return snapshot === undefined ? [] : parseCoreItemDocs(snapshot.docs)
}

/**
 * Every Item in `items` carrying `barcode` in its `barcodes`; empty when none does. It searches only
 * what `watchItems` emitted, so a soft-deleted Item and an Item whose catalogue half has not synced are
 * never matched.
 */
export function itemsWithBarcode(items: readonly ItemRecord[], barcode: core.Barcode): ItemRecord[] {
  return items.filter((item) => item.barcodes?.includes(barcode))
}

/**
 * The soft-deleted Item (`deletedAt` set on its core doc) whose `barcodes` contain `barcode`, joined
 * with its catalogue half so it can be restored. Undefined when none does, or when its catalogue doc
 * is missing or fails its schema. With several, the most recently deleted one that can be restored.
 * Answered from the local cache only, never waiting on the server, so it sees only Items `watchItems`
 * has already synced.
 */
export async function findDeletedItemByBarcode(db: Firestore, barcode: core.Barcode): Promise<ItemRecord | undefined> {
  const deleted = (await queryCoreItemsByBarcode(db, barcode)).flatMap((found) =>
    found.deletedAt === undefined ? [] : [{ ...found, deletedAt: found.deletedAt }],
  )
  const mostRecentFirst = deleted.sort(
    (a, b) => b.deletedAt.seconds - a.deletedAt.seconds || b.deletedAt.nanoseconds - a.deletedAt.nanoseconds,
  )
  for (const item of mostRecentFirst) {
    const catalogueSnapshot = await getDocFromCache(
      doc(db, catalogue.CATALOGUE_ITEMS_COLLECTION, item.id),
    ).catch(() => undefined) // a cache miss rejects; treated as not restorable, like a failed query above
    if (catalogueSnapshot === undefined || !catalogueSnapshot.exists()) continue
    const parsed = parseCatalogueItemDoc(catalogueSnapshot)
    if (parsed === undefined) continue
    const { id, ...coreItem } = item
    return toItemRecord(id, coreItem, parsed)
  }
  return undefined
}

/**
 * Every Item, live or soft-deleted, carrying `barcode`: the ones in `items` plus the ones the local
 * cache holds, each once. Empty when none does. Like {@link findDeletedItemByBarcode} it never waits on
 * the server.
 */
export async function findBarcodeHolders(
  db: Firestore,
  items: readonly ItemRecord[],
  barcode: core.Barcode,
): Promise<BarcodeHolder[]> {
  const holders = new Map<core.ItemId, BarcodeHolder>()
  for (const found of [...itemsWithBarcode(items, barcode), ...(await queryCoreItemsByBarcode(db, barcode))]) {
    holders.set(found.id, { id: found.id, name: found.name })
  }
  return [...holders.values()]
}

/** Stages taking `barcode` off each of `holders` in `batch`, leaving their other Barcodes. */
function moveBarcodeOff(batch: WriteBatch, db: Firestore, barcode: core.Barcode, holders: readonly BarcodeHolder[]): void {
  for (const holder of holders) {
    batch.update(doc(db, core.ITEMS_COLLECTION, holder.id), { barcodes: arrayRemove(barcode) })
  }
}

/**
 * Validates `barcode` with {@link core.barcode}, which throws naming it, before adding it to the Item's
 * `barcodes` with `arrayUnion`, so attaching one the Item already carries changes nothing. A Barcode sits
 * on at most one Item, so it leaves each of `holders` (any other than `item` itself) in the same batch with
 * `arrayRemove`. Resolves once the batch is queued, see {@link createItem}.
 */
export async function attachBarcode(
  db: Firestore,
  item: BarcodeHolder,
  barcode: string,
  holders: readonly BarcodeHolder[] = [],
): Promise<void> {
  const validBarcode = core.barcode(barcode)

  const batch = writeBatch(db)
  batch.update(doc(db, core.ITEMS_COLLECTION, item.id), { barcodes: arrayUnion(validBarcode) })
  moveBarcodeOff(batch, db, validBarcode, holders.filter((holder) => holder.id !== item.id))
  void batch.commit().catch((err: unknown) => {
    reportWriteRejection(`barcode change for ${item.name}`, err)
  })
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

/** Stages `delta` on the referenceCount of `categoryId`, and of `shopId` when set. */
function stageReferenceCounts(
  db: Firestore,
  batch: WriteBatch,
  categoryId: catalogue.CategoryId,
  shopId: catalogue.ShopId | undefined,
  delta: 1 | -1,
): void {
  batch.update(doc(db, catalogue.CATEGORIES_COLLECTION, categoryId), { referenceCount: increment(delta) })
  if (shopId !== undefined) {
    batch.update(doc(db, catalogue.SHOPS_COLLECTION, shopId), { referenceCount: increment(delta) })
  }
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
  stageReferenceCounts(db, batch, item.categoryId, item.shopId, delta)
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
 * back. Refused, writing nothing, when the Item's Category is not among the live `categories`, or its
 * Shop override is not among the live `shops`: the delete freed both for soft deletion, and restoring
 * onto either would leave the Item pointing at a hidden record. The refusal is reported through
 * {@link reportFailure}, so only the write-rejection banner says so.
 * See {@link restoreItemWithEdit} for picking a live Category and Shop.
 */
export async function restoreItem(
  db: Firestore,
  item: ItemRecord,
  categories: readonly Pick<CategoryRecord, 'id'>[],
  shops: readonly Pick<ShopRecord, 'id'>[],
): Promise<void> {
  if (!isLiveReference(categories, item.categoryId)) {
    reportFailure(`Could not restore ${item.name}`, new Error('Its Category has been deleted'))
    return
  }
  if (!isLiveReference(shops, item.shopId)) {
    reportFailure(`Could not restore ${item.name}`, new Error('Its Shop has been deleted'))
    return
  }
  commitItemDeletion(db, item, deleteField(), 1, 'restored Item')
}

/**
 * Restores the Item as {@link restoreItem} does, with `edit` written in the same batch as
 * {@link updateItem} would write it. The referenceCounts raised are those of the Category and Shop
 * override `edit` names, since the delete already lowered the old ones; this is how a restore picks
 * a live Category (and Shop) when the old ones are gone. `stateHistory` is left untouched.
 */
export async function restoreItemWithEdit(db: Firestore, item: ItemRecord, edit: ItemEdit): Promise<void> {
  const batch = writeBatch(db)
  const validEdit = parseItemEdit(edit)
  stageItemEdit(db, batch, item.id, validEdit, { deletedAt: deleteField() })
  stageReferenceCounts(db, batch, validEdit.categoryId, validEdit.shopId, 1)
  void batch.commit().catch((err: unknown) => {
    reportWriteRejection(`restored Item ${item.name}`, err)
  })
}
