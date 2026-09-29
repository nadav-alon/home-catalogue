import { useEffect, useState } from 'preact/hooks'
import type { Firestore } from 'firebase/firestore'
import { setItemState, watchItems, type ItemRecord } from './items.ts'
import { watchCategories, type CategoryRecord } from './categories.ts'
import { UNKNOWN_SHOP_NAME, watchShops, type ShopRecord } from './shops.ts'
import { ListRow } from '../ui/ListRow.tsx'
import { groupPendingItemsByShop } from './pendingItemsByShop.ts'

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
      await setItemState(db, item, 'enough')
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update State')
    }
  }

  const { groups: shopGroups, unresolved } = groupPendingItemsByShop(items, categories, shops)
  const groups: ShopGroup[] = shopGroups.map(({ shop, items: shopItems }) => ({
    key: shop.id,
    name: shop.name,
    items: shopItems,
  }))
  if (unresolved.length > 0) {
    groups.push({ key: UNKNOWN_SHOP_NAME, name: UNKNOWN_SHOP_NAME, items: unresolved })
  }

  return (
    <section>
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
  const runningLow = item.state === 'running low'
  return (
    <ListRow
      headline={item.name}
      supporting={runningLow ? 'optional' : undefined}
      muted={runningLow}
      trailing={<input type="checkbox" aria-label={item.name} checked={false} onChange={onTick} />}
    />
  )
}
