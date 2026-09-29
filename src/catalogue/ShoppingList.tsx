import { useEffect, useState } from 'preact/hooks'
import type { Firestore } from 'firebase/firestore'
import { catalogue } from 'data-platform'
import { isPending, resolvedShopId, setItemState, watchItems, type ItemRecord } from './items.ts'
import { watchCategories, type CategoryRecord } from './categories.ts'
import { UNKNOWN_SHOP_NAME, watchShops, type ShopRecord } from './shops.ts'

export interface ShoppingListProps {
  db: Firestore
}

interface ShopGroup {
  key: string
  name: string
  items: ItemRecord[]
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

  const pendingItems = items.filter((item) => isPending(item.state))

  const itemsByShopId = new Map<catalogue.ShopId | undefined, ItemRecord[]>()
  for (const item of pendingItems) {
    const category = categories.find((candidate) => candidate.id === item.categoryId)
    const shopId = resolvedShopId(item, category)
    const key = shops.some((shop) => shop.id === shopId) ? shopId : undefined
    const bucket = itemsByShopId.get(key)
    if (bucket !== undefined) {
      bucket.push(item)
    } else {
      itemsByShopId.set(key, [item])
    }
  }

  const groups: ShopGroup[] = shops.flatMap((shop) => {
    const shopItems = itemsByShopId.get(shop.id)
    return shopItems !== undefined ? [{ key: shop.id, name: shop.name, items: shopItems }] : []
  })
  const unresolvedItems = itemsByShopId.get(undefined)
  if (unresolvedItems !== undefined) {
    groups.push({ key: UNKNOWN_SHOP_NAME, name: UNKNOWN_SHOP_NAME, items: unresolvedItems })
  }

  return (
    <section>
      <h2>Shopping list</h2>
      {error !== null && <p role="alert">{error}</p>}
      {groups.map(({ key, name, items: groupItems }) => (
        <div key={key}>
          <h3>{name}</h3>
          <ul>
            {groupItems.map((item) => (
              <ShoppingListRow key={item.id} item={item} onTick={() => void handleTick(item)} />
            ))}
          </ul>
        </div>
      ))}
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
