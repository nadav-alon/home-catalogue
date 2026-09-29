import { useEffect, useState } from 'preact/hooks'
import type { Firestore } from 'firebase/firestore'
import { AlertBanner } from './catalogue/AlertBanner.tsx'
import { CategoriesManager } from './catalogue/CategoriesManager.tsx'
import { ShopsManager } from './catalogue/ShopsManager.tsx'
import { ItemsManager } from './catalogue/ItemsManager.tsx'
import { ShoppingList } from './catalogue/ShoppingList.tsx'
import { watchItems, type ItemRecord } from './catalogue/items.ts'
import { CalendarExport } from './export/CalendarExport.tsx'
import { AddDeviceQrCode } from './setup/AddDeviceQrCode.tsx'
import type { FirebaseWebConfig } from './firebase/webConfig.ts'

export interface AppProps {
  db: Firestore
  config: FirebaseWebConfig
}

export function App({ db, config }: AppProps) {
  const [items, setItems] = useState<ItemRecord[]>([])

  useEffect(() => watchItems(db, setItems), [db])

  return (
    <main>
      <h1>Home Catalogue</h1>
      <AlertBanner items={items} />
      <AddDeviceQrCode config={config} />
      <ShoppingList db={db} />
      <CalendarExport db={db} />
      <ShopsManager db={db} />
      <CategoriesManager db={db} />
      <ItemsManager db={db} />
    </main>
  )
}
