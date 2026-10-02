import type { core } from 'data-platform'
import type { Firestore } from 'firebase/firestore'
import { WriteRejectionBanner } from './catalogue/WriteRejectionBanner.tsx'
import { CategoriesManager } from './catalogue/CategoriesManager.tsx'
import { ShopsManager } from './catalogue/ShopsManager.tsx'
import { ItemsManager } from './catalogue/ItemsManager.tsx'
import { ShoppingList } from './catalogue/ShoppingList.tsx'
import { MembersScreen } from './members/MembersScreen.tsx'
import { UpdateNotice } from './pwa/UpdateNotice.tsx'
import { SettingsScreen } from './settings/SettingsScreen.tsx'
import { NavBar } from './shell/NavBar.tsx'
import { TopAppBar } from './shell/TopAppBar.tsx'
import { titleOf } from './shell/titles.ts'
import { SnackbarHost } from './ui/Snackbar.tsx'
import type { CategoryAndShop, Route } from './ui/route.ts'
import { navigateToCategoryAndShop, setCategoryAndShop, useCategoryAndShop, useItemIds, useRoute } from './ui/useRoute.ts'
import './app.css'
import type { FirebaseWebConfig } from './firebase/webConfig.ts'

export interface AppProps {
  db: Firestore
  config: FirebaseWebConfig
  onResetConfig: () => void | Promise<void>
  onSignOut: () => void | Promise<void>
}

export function App({ db, config, onResetConfig, onSignOut }: AppProps) {
  const current = useRoute()
  const itemIds = useItemIds()
  const filter = useCategoryAndShop()

  return (
    <>
      <NavBar />
      <div class="app-content">
        <TopAppBar title={titleOf(current)}>
          <main>
            <UpdateNotice />
            <WriteRejectionBanner />
            <Screen route={current} itemIds={itemIds} filter={filter} db={db} config={config} onResetConfig={onResetConfig} onSignOut={onSignOut} />
          </main>
        </TopAppBar>
      </div>
      <SnackbarHost />
    </>
  )
}

/** The screen for a route. */
function Screen({
  route: current,
  itemIds,
  filter,
  db,
  config,
  onResetConfig,
  onSignOut,
}: { route: Route; itemIds: readonly core.ItemId[]; filter: CategoryAndShop } & AppProps) {
  switch (current) {
    case '/list':
      return <ShoppingList db={db} />
    case '/items':
      return <ItemsManager db={db} itemIds={itemIds} filter={filter} onFilterChange={setCategoryAndShop} onClearFilter={navigateToCategoryAndShop} />
    case '/settings':
      return <SettingsScreen config={config} onResetConfig={onResetConfig} onSignOut={onSignOut} />
    case '/settings/shops':
      return <ShopsManager db={db} />
    case '/settings/categories':
      return <CategoriesManager db={db} />
    case '/settings/members':
      return <MembersScreen db={db} config={config} />
  }
}
