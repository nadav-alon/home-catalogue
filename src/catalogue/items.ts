import { collection, doc, onSnapshot, orderBy, query, writeBatch, type Firestore } from 'firebase/firestore'
import { catalogue, core } from 'data-platform'

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
 * generated id, as one batch. A new Item always starts at State `enough`. Resolves once the batch
 * is queued, not once Firestore acknowledges it, so a caller offline is not left waiting; a batch
 * that later fails to sync is only logged.
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
  void batch.commit().catch((err: unknown) => {
    console.error('Failed to sync new Item', err)
  })
}
