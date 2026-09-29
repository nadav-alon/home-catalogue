import { ListRow } from '../ui/ListRow.tsx'
import { hashOf, route, type Route } from '../ui/route.ts'
import { navigate } from '../ui/useRoute.ts'
import { titleOf } from '../shell/titles.ts'

const SHOPS = route('/settings/shops')
const CATEGORIES = route('/settings/categories')

/** The Settings screen: a list of rows, each opening a sub-page or running a device-level action. */
export function SettingsScreen() {
  return (
    <ul>
      <NavigationRow to={SHOPS} />
      <NavigationRow to={CATEGORIES} />
    </ul>
  )
}

function NavigationRow({ to }: { to: Route }) {
  const title = titleOf(to)
  return (
    <ListRow
      headline={title}
      trailing={
        <a
          href={hashOf(to)}
          aria-label={`Open ${title}`}
          onClick={(event) => {
            event.preventDefault()
            navigate(to)
          }}
        >
          ›
        </a>
      }
    />
  )
}
