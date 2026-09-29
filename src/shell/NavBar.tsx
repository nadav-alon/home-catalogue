import { Icon, type IconSymbol } from '../ui/Icon.tsx'
import { hashOf, route, type Route } from '../ui/route.ts'
import { useRoute } from '../ui/useRoute.ts'
import ListIcon from '~icons/material-symbols/checklist'
import ItemsIcon from '~icons/material-symbols/inventory-2-outline'
import SettingsIcon from '~icons/material-symbols/settings-outline'
import './NavBar.css'

interface Destination {
  route: Route
  label: string
  symbol: IconSymbol
  /** Routes under this destination that keep it marked active. */
  also: readonly Route[]
}

const DESTINATIONS: readonly Destination[] = [
  { route: route('/list'), label: 'Shopping list', symbol: ListIcon, also: [] },
  { route: route('/items'), label: 'Items', symbol: ItemsIcon, also: [] },
  { route: route('/settings'), label: 'Settings', symbol: SettingsIcon, also: [route('/settings/shops'), route('/settings/categories')] },
]

/** The app's top-level destinations: a bottom bar below 600px, a left rail from 600px. */
export function NavBar() {
  const current = useRoute()
  return (
    <nav class="shell-nav" aria-label="Main">
      {DESTINATIONS.map((destination) => {
        const active = destination.route === current || destination.also.includes(current)
        return (
          <a
            key={destination.route}
            class="shell-nav__destination"
            href={hashOf(destination.route)}
            aria-current={active ? 'page' : undefined}
          >
            <span class="shell-nav__pill">
              <Icon symbol={destination.symbol} size="1.5rem" />
            </span>
            {destination.label}
          </a>
        )
      })}
    </nav>
  )
}
