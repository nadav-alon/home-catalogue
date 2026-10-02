import { useEffect, useState } from 'preact/hooks'
import type { Firestore } from 'firebase/firestore'
import type { core } from 'data-platform'
import { setItemState, watchItems, type ItemRecord } from './items.ts'
import { watchCategories, type CategoryRecord } from './categories.ts'
import { UNKNOWN_SHOP_NAME, watchShops, type ShopRecord } from './shops.ts'
import { AlertBanner } from './AlertBanner.tsx'
import { CalendarExport } from '../export/CalendarExport.tsx'
import { ListRow } from '../ui/ListRow.tsx'
import { showSnackbar } from '../ui/Snackbar.tsx'
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
  const [items, setItems] = useState<ItemRecord[] | null>(null)
  const [categories, setCategories] = useState<CategoryRecord[]>([])
  const [shops, setShops] = useState<ShopRecord[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => watchItems(db, setItems), [db])
  useEffect(() => watchCategories(db, setCategories), [db])
  useEffect(() => watchShops(db, setShops), [db])

  async function handleSetState(item: ItemRecord, state: core.State) {
    try {
      await setItemState(db, item, state)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update State')
    }
  }

  function handleTick(item: ItemRecord) {
    void handleSetState(item, 'enough')
    showSnackbar({
      text: `Marked ${item.name} enough`,
      action: { label: 'Undo', onAction: () => void handleSetState(item, item.state) },
    })
  }

  const { groups: shopGroups, unresolved } = groupPendingItemsByShop(items ?? [], categories, shops)
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
      <AlertBanner items={items ?? []} />
      <CalendarExport items={items ?? []} categories={categories} shops={shops} />
      {error !== null && <p role="alert">{error}</p>}
      {items !== null && groups.length === 0 && <p>Nothing to buy — every Item is enough.</p>}
      {groups.map(({ key, name, items: groupItems }) => (
        <div key={key}>
          <h2>{name}</h2>
          <ul>
            {groupItems.map((item) => (
              <ShoppingListRow key={item.id} item={item} onTick={() => handleTick(item)} />
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
      supporting={runningLow ? 'running low' : undefined}
      muted={runningLow}
      control={<input type="checkbox" checked={false} onChange={onTick} />}
    />
  )
}
