import { AddDeviceQrCode } from '../setup/AddDeviceQrCode.tsx'
import type { FirebaseWebConfig } from '../firebase/webConfig.ts'
import { Button } from '../ui/Button.tsx'
import { Icon } from '../ui/Icon.tsx'
import { ListRow } from '../ui/ListRow.tsx'
import { hashOf, route, type Route } from '../ui/route.ts'
import { navigate } from '../ui/useRoute.ts'
import { ResetConfigButton } from '../setup/ResetConfigButton.tsx'
import { titleOf } from '../shell/titles.ts'
import ChevronRightIcon from '~icons/material-symbols/chevron-right'

const SHOPS = route('/settings/shops')
const CATEGORIES = route('/settings/categories')

export interface SettingsScreenProps {
  config: FirebaseWebConfig
  /** Forgets the stored Firebase configuration; called once the user has confirmed. */
  onResetConfig: () => void | Promise<void>
  onSignOut: () => void | Promise<void>
}

/** The Settings screen: a list of rows, each opening a sub-page or running a device-level action. */
export function SettingsScreen({ config, onResetConfig, onSignOut }: SettingsScreenProps) {
  return (
    <ul>
      <NavigationRow to={SHOPS} />
      <NavigationRow to={CATEGORIES} />
      <li>
        <AddDeviceQrCode config={config} />
      </li>
      <ListRow
        headline="Reset Firebase configuration"
        trailing={<ResetConfigButton onResetConfig={onResetConfig} />}
      />
      <ListRow
        headline="Sign out"
        trailing={
          <Button variant="tonal" onClick={() => void onSignOut()}>
            Sign out
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
          <Icon symbol={ChevronRightIcon} size="1.5rem" />
        </a>
      }
    />
  )
}
