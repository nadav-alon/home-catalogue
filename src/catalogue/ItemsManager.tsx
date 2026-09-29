import { useEffect, useState } from 'preact/hooks'
import type { Firestore } from 'firebase/firestore'
import { catalogue } from 'data-platform'
import { watchItems, type ItemRecord } from './items.ts'
import { watchCategories, type CategoryRecord } from './categories.ts'
import { watchShops, type ShopRecord } from './shops.ts'

export interface ItemsManagerProps {
  db: Firestore
}

export function ItemsManager({ db }: ItemsManagerProps) {
  const [items, setItems] = useState<ItemRecord[]>([])
  const [categories, setCategories] = useState<CategoryRecord[]>([])
  const [shops, setShops] = useState<ShopRecord[]>([])

  useEffect(() => watchItems(db, setItems), [db])
  useEffect(() => watchCategories(db, setCategories), [db])
  useEffect(() => watchShops(db, setShops), [db])

  function shopName(shopId: catalogue.ShopId): string {
    return shops.find((shop) => shop.id === shopId)?.name ?? shopId
  }

  function resolvedShopName(item: ItemRecord, category: CategoryRecord): string {
    return shopName(catalogue.resolveShop(item, category))
  }

  const groups = categories
    .map((category) => ({ category, items: items.filter((item) => item.categoryId === category.id) }))
    .filter((group) => group.items.length > 0)

  return (
    <section>
      <h2>Items</h2>
      {groups.map(({ category, items: categoryItems }) => (
        <div key={category.id}>
          <h3>{category.name}</h3>
          <ul>
            {categoryItems.map((item) => (
              <ItemRow key={item.id} item={item} resolvedShopName={resolvedShopName(item, category)} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}

interface ItemRowProps {
  item: ItemRecord
  resolvedShopName: string
}

function ItemRow({ item, resolvedShopName }: ItemRowProps) {
  return (
    <li>
      <span>{item.name}</span>
      {item.brandNote !== undefined && <span>{item.brandNote}</span>}
      <span>{item.necessity}</span>
      <span>Shop: {resolvedShopName}</span>
    </li>
  )
}
