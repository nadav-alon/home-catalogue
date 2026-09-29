import { useEffect, useState } from 'preact/hooks'
import type { Firestore } from 'firebase/firestore'
import { catalogue } from 'data-platform'
import { setItemState, watchItems, type ItemRecord } from './items.ts'
import { watchCategories, type CategoryRecord } from './categories.ts'
import { UNKNOWN_SHOP_NAME, watchShops, type ShopRecord } from './shops.ts'

export interface ShoppingListProps {
  db: Firestore
}

/** The Shop an Item resolves to for the Shopping list: its Category's, unless the Category is itself unresolved. */
function resolvedShopId(item: ItemRecord, categories: CategoryRecord[]): catalogue.ShopId | undefined {
  const category = categories.find((candidate) => candidate.id === item.categoryId)
  return category !== undefined ? catalogue.resolveShop(item, category) : item.shopId
}

export function ShoppingList({ db }: ShoppingListProps) {
  const [items, setItems] = useState<ItemRecord[]>([])
  const [categories, setCategories] = useState<CategoryRecord[]>([])
  const [shops, setShops] = useState<ShopRecord[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => watchItems(db, setItems), [db])
  useEffect(() => watchCategories(db, setCategories), [db])
  useEffect(() => watchShops(db, setShops), [db])

  async function handleTick(item: ItemRecord) {
    try {
      await setItemState(db, item.id, 'enough')
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update State')
    }
  }

  const pendingItems = items.filter((item) => item.state === 'running low' || item.state === 'out')

  const groups = shops
    .map((shop) => ({
      shop,
      items: pendingItems.filter((item) => resolvedShopId(item, categories) === shop.id),
    }))
    .filter((group) => group.items.length > 0)

  const unresolvedItems = pendingItems.filter(
    (item) => !shops.some((shop) => shop.id === resolvedShopId(item, categories)),
  )

  return (
    <section>
      <h2>Shopping list</h2>
      {error !== null && <p role="alert">{error}</p>}
      {groups.map(({ shop, items: shopItems }) => (
        <div key={shop.id}>
          <h3>{shop.name}</h3>
          <ul>
            {shopItems.map((item) => (
              <ShoppingListRow key={item.id} item={item} onTick={() => void handleTick(item)} />
            ))}
          </ul>
        </div>
      ))}
      {unresolvedItems.length > 0 && (
        <div>
          <h3>{UNKNOWN_SHOP_NAME}</h3>
          <ul>
            {unresolvedItems.map((item) => (
              <ShoppingListRow key={item.id} item={item} onTick={() => void handleTick(item)} />
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

interface ShoppingListRowProps {
  item: ItemRecord
  onTick: () => void
}

function ShoppingListRow({ item, onTick }: ShoppingListRowProps) {
  return (
    <li>
      <label>
        <input type="checkbox" checked={false} onChange={onTick} />
        {item.name}
      </label>
      {item.state === 'running low' && <span>optional</span>}
    </li>
  )
}
