import { Icon, type IconSymbol } from '../ui/Icon.tsx'
import { hashOf, route, type Route } from '../ui/route.ts'
import { titleOf } from './titles.ts'
import { navigate, useRoute } from '../ui/useRoute.ts'
import ListIcon from '~icons/material-symbols/checklist'
import ItemsIcon from '~icons/material-symbols/inventory-2-outline'
import SettingsIcon from '~icons/material-symbols/settings-outline'
import './NavBar.css'

interface Destination {
  route: Route
  symbol: IconSymbol
}

const DESTINATIONS: readonly Destination[] = [
  { route: route('/list'), symbol: ListIcon },
  { route: route('/items'), symbol: ItemsIcon },
  { route: route('/settings'), symbol: SettingsIcon },
]

/** The app's top-level destinations: a bottom bar below 600px, a left rail from 600px. */
export function NavBar() {
  const current = useRoute()
  return (
    <nav class="shell-nav" aria-label="Main">
      {DESTINATIONS.map((destination) => {
        const active = current === destination.route || current.startsWith(`${destination.route}/`)
        return (
          <a
            key={destination.route}
            class="shell-nav__destination"
            href={hashOf(destination.route)}
            onClick={(event) => {
              event.preventDefault()
              navigate(destination.route)
            }}
            aria-current={active ? 'page' : undefined}
          >
            <span class="shell-nav__pill">
              <Icon symbol={destination.symbol} size="1.5rem" />
            </span>
            {titleOf(destination.route)}
          </a>
        )
      })}
    </nav>
  )
}
