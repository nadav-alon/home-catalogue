import { useEffect, useState } from 'preact/hooks'
import type { Firestore } from 'firebase/firestore'
import { AlertBanner } from './catalogue/AlertBanner.tsx'
import { WriteRejectionBanner } from './catalogue/WriteRejectionBanner.tsx'
import { CategoriesManager } from './catalogue/CategoriesManager.tsx'
import { ShopsManager } from './catalogue/ShopsManager.tsx'
import { ItemsManager } from './catalogue/ItemsManager.tsx'
import { ShoppingList } from './catalogue/ShoppingList.tsx'
import { watchItems, type ItemRecord } from './catalogue/items.ts'
import { CalendarExport } from './export/CalendarExport.tsx'
import { AddDeviceQrCode } from './setup/AddDeviceQrCode.tsx'
import { SettingsScreen } from './settings/SettingsScreen.tsx'
import { NavBar } from './shell/NavBar.tsx'
import { TopAppBar } from './shell/TopAppBar.tsx'
import { titleOf } from './shell/titles.ts'
import type { Route } from './ui/route.ts'
import { useRoute } from './ui/useRoute.ts'
import './app.css'
import type { FirebaseWebConfig } from './firebase/webConfig.ts'

export interface AppProps {
  db: Firestore
  config: FirebaseWebConfig
}

export function App({ db, config }: AppProps) {
  const [items, setItems] = useState<ItemRecord[]>([])
  const current = useRoute()

  useEffect(() => watchItems(db, setItems), [db])

  return (
    <>
      <NavBar />
      <div class="app-content">
        <TopAppBar title={titleOf(current)}>
          <main>
            <WriteRejectionBanner />
            <AlertBanner items={items} />
            <Screen route={current} db={db} config={config} />
          </main>
        </TopAppBar>
      </div>
    </>
  )
}

/** The screen for a route. */
function Screen({ route: current, db, config }: { route: Route } & AppProps) {
  switch (current) {
    case '/list':
      // TODO[#135]: the Shopping list screen.
      return (
        <>
          <ShoppingList db={db} />
          <CalendarExport db={db} />
        </>
      )
    case '/items':
      // TODO[#136]: the Items screen.
      return <ItemsManager db={db} />
    case '/settings':
      return (
        <>
          <SettingsScreen />
          <AddDeviceQrCode config={config} />
        </>
      )
    case '/settings/shops':
      // TODO[#140]: the Shops screen.
      return <ShopsManager db={db} />
    case '/settings/categories':
      // TODO[#141]: the Categories screen.
      return <CategoriesManager db={db} />
  }
}
