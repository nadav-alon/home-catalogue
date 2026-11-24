import { useEffect, useRef, useState } from 'preact/hooks'
import type { Firestore } from 'firebase/firestore'
import type { catalogue, core } from 'data-platform'
import { setIngredientBought, watchRecipeIngredientShop } from 'data-platform/client'
import { attachBarcode, createItem, findBarcodeHolders, findDeletedItemByBarcode, isLiveReference, itemsWithBarcode, restoreItem, restoreItemWithEdit, setItemState, watchItems, type BarcodeHolder, type CarriedBarcode, type ItemRecord } from './items.ts'
import { createCategory, watchCategories, type CategoryRecord } from './categories.ts'
import { createAisle, watchAisles, type AisleRecord } from './aisles.ts'
import { getChosenStoreIds, getSortByAisle, saveChosenStoreIds, saveSortByAisle, storesOfShop, storesToSortBy } from './aisleSort.ts'
import { watchStores, type StoreRecord } from './stores.ts'
import { Select } from 'household-ui/ui/Select.tsx'
import { createTag, watchTags, type TagRecord } from './tags.ts'
import { watchShops, type ShopRecord } from './shops.ts'
import { AlertBanner } from './AlertBanner.tsx'
import { ItemDialog } from './ItemDialog.tsx'
import { RestoreDeletedItemOffer } from '../scan/RestoreDeletedItemOffer.tsx'
import { UnknownBarcodeChooser } from '../scan/UnknownBarcodeChooser.tsx'
import { ScanEntry } from '../scan/ScanEntry.tsx'
import { CalendarExport } from '../export/CalendarExport.tsx'
import { ListRow } from 'household-ui/ui/ListRow.tsx'
import { showSnackbar } from 'household-ui/ui/Snackbar.tsx'
import { narrowedToRecipe, shoppingListGroups } from './shoppingListGroups.ts'
import './ShoppingList.css'
import { RecipeFilter } from './RecipeFilter.tsx'
import { chosenRecipe, recipeChipLabels, wantedRecipesByItem, watchRecipes as watchLiveRecipes, type RecipeRecord, type RecipeRow, type WatchRecipes } from './recipes.ts'

export interface ShoppingListProps {
  db: Firestore
  /** Where the Recipes come from; the Household's live Recipes unless a test supplies a fake. */
  watchRecipes?: WatchRecipes
}

export function ShoppingList({ db, watchRecipes = watchLiveRecipes }: ShoppingListProps) {
  const [items, setItems] = useState<ItemRecord[] | null>(null)
  const [categories, setCategories] = useState<CategoryRecord[]>([])
  const [shops, setShops] = useState<ShopRecord[]>([])
  const [tags, setTags] = useState<TagRecord[]>([])
  const [aisles, setAisles] = useState<AisleRecord[]>([])
  const [stores, setStores] = useState<StoreRecord[]>([])
  const [sortByAisle, setSortByAisle] = useState(getSortByAisle)
  const [chosenStoreIds, setChosenStoreIds] = useState(getChosenStoreIds)
  const [recipes, setRecipes] = useState<RecipeRecord[] | null>(null)
  /** The Household's Shop for Recipe Ingredients: `undefined` when unset or not live, `null` until the setting has loaded. */
  const [recipeShopId, setRecipeShopId] = useState<catalogue.ShopId | undefined | null>(null)
  /** The latest Recipes, read when Undo is pressed rather than when the row was ticked. */
  const latestRecipes = useRef<RecipeRecord[] | null>(null)
  latestRecipes.current = recipes
  /** The Recipe the list is narrowed to; one that is deleted stops filtering. */
  const [selectedRecipeId, setSelectedRecipeId] = useState<RecipeRecord['id']>()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => watchItems(db, setItems), [db])
  useEffect(() => watchRecipes(db, setRecipes), [db, watchRecipes])
  useEffect(() => watchRecipeIngredientShop(db, setRecipeShopId, (err) => setError(err.message)), [db])
  useEffect(() => watchTags(db, setTags), [db])
  useEffect(() => watchAisles(db, setAisles), [db])
  useEffect(() => watchStores(db, setStores), [db])
  /** Whether `watchCategories` and `watchShops` have delivered, so a missing Category or Shop means deleted, not not-yet-loaded. */
  const [listsLoaded, setListsLoaded] = useState({ categories: false, shops: false })
  useEffect(
    () =>
      watchCategories(db, (records) => {
        setCategories(records)
        setListsLoaded((current) => ({ ...current, categories: true }))
      }),
    [db],
  )
  useEffect(
    () =>
      watchShops(db, (records) => {
        setShops(records)
        setListsLoaded((current) => ({ ...current, shops: true }))
      }),
    [db],
  )

  /** Set by a scan made before the Items arrived; shown only while they are still loading. */
  const [scanWaiting, setScanWaiting] = useState(false)
  /** The scanned Barcode no live Item carries, and the Items it still sits on, while the Member chooses what to do with it. */
  const [unknownBarcode, setUnknownBarcode] = useState<{ barcode: core.Barcode; holders: BarcodeHolder[] }>()
  /** The deleted Item a scanned Barcode belongs to, and that Barcode, while the Member is deciding whether to bring it back. */
  const [deletedMatch, setDeletedMatch] = useState<{ item: ItemRecord; barcode: core.Barcode }>()
  /** The deleted Item whose Category or Shop is gone, while the Member picks live ones to restore it with. */
  const [itemToRestore, setItemToRestore] = useState<ItemRecord>()
  /** The Barcode a new Item carries from the start, while the Item dialog is open. */
  const [newItemBarcode, setNewItemBarcode] = useState<CarriedBarcode>()

  async function handleSetState(item: ItemRecord, state: core.State) {
    try {
      await setItemState(db, item, state)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update State')
    }
  }

  function handleTick(item: ItemRecord, text = `Marked ${item.name} enough`) {
    void handleSetState(item, 'enough')
    showSnackbar({
      text,
      action: { label: 'Undo', onAction: () => void handleSetState(item, item.state) },
    })
  }

  async function handleSetBought(row: RecipeRow, bought: boolean) {
    try {
      if (!bought) {
        const current = latestRecipes.current?.find((recipe) => recipe.id === row.recipe.id)
        if (current?.ingredients[row.position]?.name !== row.name) {
          setError(`Could not undo: ${row.recipe.title} changed, so ${row.name} is still marked bought`)
          return
        }
      }
      await setIngredientBought(db, row.recipe.id, row.position, bought)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the Ingredient')
    }
  }

  /** Ticking a Recipe row marks its Ingredient Bought; Undo clears that. */
  function handleTickRecipeRow(row: RecipeRow) {
    void handleSetBought(row, true)
    showSnackbar({
      text: `Marked ${row.name} bought`,
      action: { label: 'Undo', onAction: () => void handleSetBought(row, false) },
    })
  }

  /** A scanned Barcode sits on at most one Item; it is set `enough` whether or not it is on the Shopping list. */
  function handleScan(barcode: core.Barcode) {
    if (items === null) {
      setScanWaiting(true)
      return
    }
    setScanWaiting(false)
    const [item] = itemsWithBarcode(items, barcode)
    if (item?.state === 'enough') return showSnackbar({ text: `${item.name} is already enough` })
    if (item !== undefined) return handleTick(item)
    void lookUpUnknown(items, barcode)
  }

  async function lookUpUnknown(liveItems: readonly ItemRecord[], barcode: core.Barcode) {
    try {
      const deleted = await findDeletedItemByBarcode(db, barcode)
      if (deleted !== undefined) return setDeletedMatch({ item: deleted, barcode })
    } catch (err) {
      return setError(err instanceof Error ? err.message : 'Could not look up the barcode')
    }
    await openChooser(liveItems, barcode)
  }

  async function openChooser(liveItems: readonly ItemRecord[], barcode: core.Barcode) {
    try {
      setUnknownBarcode({ barcode, holders: await findBarcodeHolders(db, liveItems, barcode) })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not look up the barcode')
    }
  }

  async function handleRestore(item: ItemRecord) {
    // Until both lists have loaded, a Category or Shop cannot be told from a deleted one; the offer stays open.
    if (!listsLoaded.categories || !listsLoaded.shops) {
      return showSnackbar({ text: 'Categories and Shops are still loading, try again in a moment' })
    }
    setDeletedMatch(undefined)
    if (!isLiveReference(categories, item.categoryId) || !isLiveReference(shops, item.shopId)) return setItemToRestore(item)
    try {
      await restoreItem(db, item, categories, shops)
      setError(null)
      showSnackbar({ text: `Restored ${item.name}` })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not restore the Item')
    }
  }

  async function handleDeclineRestore() {
    if (deletedMatch === undefined) return
    const { barcode } = deletedMatch
    setDeletedMatch(undefined)
    await openChooser(items ?? [], barcode)
  }

  /** Attaching sets the picked Item `enough` with Undo, unless it already is; Undo reverts the State, not the attach. */
  async function handleAttach(item: ItemRecord, holders: readonly BarcodeHolder[]) {
    if (unknownBarcode === undefined) return
    try {
      await attachBarcode(db, item, unknownBarcode.barcode, holders)
      setUnknownBarcode(undefined)
      setError(null)
      if (item.state === 'enough') showSnackbar({ text: `Added barcode to ${item.name}` })
      else handleTick(item, `Added barcode to ${item.name} and marked it enough`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the barcode')
    }
  }

  function handleToggleSortByAisle(on: boolean) {
    setSortByAisle(on)
    saveSortByAisle(on)
  }

  function handleChooseStore(shop: ShopRecord, store: StoreRecord) {
    const next = new Map(chosenStoreIds).set(shop.id, store.id)
    setChosenStoreIds(next)
    saveChosenStoreIds(next)
  }

  const sortingStores = storesToSortBy(sortByAisle, shops, stores, aisles, chosenStoreIds)
  const recipesByItem = wantedRecipesByItem(recipes ?? [])
  const selected = chosenRecipe(recipes ?? [], selectedRecipeId)
  const selectedRecipe = selected?.recipe
  const allGroups = shoppingListGroups(items ?? [], categories, shops, sortingStores, recipes ?? [], listsLoaded.shops ? recipeShopId : null)
  const groups = selected === undefined ? allGroups : narrowedToRecipe(allGroups, selected.recipe.id, selected.itemIds)

  return (
    <section>
      <label>
        <input type="checkbox" checked={sortByAisle} onChange={(event) => handleToggleSortByAisle(event.currentTarget.checked)} />
        Sort by aisle
      </label>
      <ScanEntry onScan={handleScan} />
      <RecipeFilter recipes={recipes ?? []} selectedId={selectedRecipe?.id} onChange={setSelectedRecipeId} />
      <AlertBanner items={items ?? []} />
      {/* Export ignores the Recipe filter. */}
      <CalendarExport items={items ?? []} categories={categories} shops={shops} sortingStores={sortingStores} recipes={recipes ?? []} recipeShopId={listsLoaded.shops ? recipeShopId : null} />
      {error !== null && <p role="alert">{error}</p>}
      {scanWaiting && items === null && <p role="status">Items are still loading, scan again in a moment</p>}
      {items !== null && recipes !== null && groups.length === 0 && <p>Nothing to buy — every Item is enough.</p>}
      {groups.map(({ kind, name, shop, items: groupItems, recipeRows: groupRecipeRows }) => {
        const options = sortByAisle && shop !== undefined ? storesOfShop(stores, shop) : []
        const sortingStore = shop === undefined ? undefined : sortingStores.get(shop.id)
        return (
          <div key={shop?.id ?? kind}>
            <h2>{name}</h2>
            {shop !== undefined && sortingStore !== undefined && options.length > 1 && (
              <Select
                label="Store"
                value={sortingStore.id}
                onChange={(event) => {
                  const picked = options.find((option) => option.id === event.currentTarget.value)
                  if (picked !== undefined) handleChooseStore(shop, picked)
                }}
              >
                {options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </Select>
            )}
            <ul>
              {groupItems.map((item) => (
                <ShoppingListRow key={item.id} item={item} neededBy={recipesByItem.get(item.id) ?? []} onTick={() => handleTick(item)} />
              ))}
              {groupRecipeRows.map((row) => (
                <ShoppingListRecipeRow key={`${row.recipe.id}:${row.position}`} row={row} onTick={() => handleTickRecipeRow(row)} />
              ))}
            </ul>
          </div>
        )
      })}
      <RestoreDeletedItemOffer item={deletedMatch?.item} onRestore={(item) => void handleRestore(item)} onDecline={() => void handleDeclineRestore()} />
      <UnknownBarcodeChooser
        barcode={unknownBarcode?.barcode}
        items={items ?? []}
        holders={unknownBarcode?.holders ?? []}
        onAttach={(item, from) => void handleAttach(item, from)}
        onNewItem={(from) => {
          if (unknownBarcode !== undefined) setNewItemBarcode({ value: unknownBarcode.barcode, movedOff: from })
          setUnknownBarcode(undefined)
        }}
        onClose={() => setUnknownBarcode(undefined)}
      />
      <ItemDialog
        open={newItemBarcode !== undefined}
        barcode={newItemBarcode?.value}
        categories={categories}
        shops={shops}
        tags={tags}
        aisles={aisles}
        onCreateCategory={(name, defaultShopId) => createCategory(db, name, defaultShopId)}
        onCreateTag={(name) => createTag(db, name)}
        onCreateAisle={(name) => createAisle(db, name)}
        onSave={async (input) => {
          if (input.state !== undefined) await createItem(db, { ...input, barcode: newItemBarcode })
        }}
        onClose={() => setNewItemBarcode(undefined)}
      />
      <ItemDialog
        open={itemToRestore !== undefined}
        item={itemToRestore}
        restoring
        categories={categories}
        shops={shops}
        tags={tags}
        aisles={aisles}
        onCreateCategory={(name, defaultShopId) => createCategory(db, name, defaultShopId)}
        onCreateTag={(name) => createTag(db, name)}
        onCreateAisle={(name) => createAisle(db, name)}
        onSave={async (input) => {
          if (itemToRestore !== undefined) await restoreItemWithEdit(db, itemToRestore, input)
        }}
        onClose={() => setItemToRestore(undefined)}
      />
    </section>
  )
}

interface ShoppingListRowProps {
  item: ItemRecord
  /** The Wanted Recipes that link the Item; each is named in a chip. */
  neededBy: readonly RecipeRecord[]
  onTick: () => void
}

function ShoppingListRow({ item, neededBy, onTick }: ShoppingListRowProps) {
  const runningLow = item.state === 'running low'
  const chipLabels = recipeChipLabels(neededBy)
  return (
    <ListRow
      headline={item.name}
      supporting={runningLow ? 'running low' : undefined}
      muted={runningLow}
      trailing={chipLabels.length === 0 ? undefined : <RecipeChips recipes={neededBy} />}
      control={<input type="checkbox" checked={false} onChange={onTick} />}
    />
  )
}

/** A Recipe row: the Ingredient's name and its Recipe's chip, with no State flag. */
function ShoppingListRecipeRow({ row, onTick }: { row: RecipeRow; onTick: () => void }) {
  return (
    <ListRow
      headline={row.name}
      trailing={<RecipeChips recipes={[row.recipe]} />}
      control={<input type="checkbox" checked={false} onChange={onTick} />}
    />
  )
}

/** The "for <Recipe>" chips of a row: the one place a chip's markup and class live. */
function RecipeChips({ recipes }: { recipes: readonly RecipeRecord[] }) {
  return (
    <>
      {recipeChipLabels(recipes).map(({ key, label }) => (
        <span key={key} class="shopping-list__recipe-chip">
          {label}
        </span>
      ))}
    </>
  )
}
