import { AddDeviceQrCode } from '../setup/AddDeviceQrCode.tsx'
import type { FirebaseWebConfig } from '../firebase/webConfig.ts'
import { Button } from '../ui/Button.tsx'
import { ListRow } from '../ui/ListRow.tsx'
import { hashOf, route, type Route } from '../ui/route.ts'
import { navigate } from '../ui/useRoute.ts'
import { titleOf } from '../shell/titles.ts'

const SHOPS = route('/settings/shops')
const CATEGORIES = route('/settings/categories')

/** The Settings screen: a list of rows, each opening a sub-page or running a device-level action. */
export interface SettingsScreenProps {
  config: FirebaseWebConfig
  /** Forgets the stored Firebase configuration; called once the user has confirmed. */
  onResetConfig: () => void | Promise<void>
}

export function SettingsScreen({ config, onResetConfig }: SettingsScreenProps) {
  return (
    <ul>
      <NavigationRow to={SHOPS} />
      <NavigationRow to={CATEGORIES} />
      <li>
        <AddDeviceQrCode config={config} />
      </li>
      <ListRow
        headline="Reset Firebase configuration"
        trailing={
          <Button
            variant="text"
            onClick={() => {
              if (confirm('Reset the Firebase configuration on this device?')) void onResetConfig()
            }}
          >
            Reset
          </Button>
        }
      />
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
