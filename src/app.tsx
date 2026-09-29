import type { Firestore } from 'firebase/firestore'
import { CategoriesManager } from './catalogue/CategoriesManager.tsx'
import { ShopsManager } from './catalogue/ShopsManager.tsx'
import { ItemsManager } from './catalogue/ItemsManager.tsx'
import { ShoppingList } from './catalogue/ShoppingList.tsx'
import { AddDeviceQrCode } from './setup/AddDeviceQrCode.tsx'
import type { FirebaseWebConfig } from './firebase/webConfig.ts'

export interface AppProps {
  db: Firestore
  config: FirebaseWebConfig
}

export function App({ db, config }: AppProps) {
  return (
    <main>
      <h1>Home Catalogue</h1>
      <AddDeviceQrCode config={config} />
      <ShoppingList db={db} />
      <ShopsManager db={db} />
      <CategoriesManager db={db} />
      <ItemsManager db={db} />
    </main>
  )
}
