import { TopAppBarNavigation } from '../shell/TopAppBar.tsx'
import { IconButton } from '../ui/IconButton.tsx'
import { route } from '../ui/route.ts'
import { navigate } from '../ui/useRoute.ts'
import ArrowBackIcon from '~icons/material-symbols/arrow-back'

const SETTINGS = route('/settings')

/** The Household's Members and pending invites, read-only; every Member can open it. */
export function MembersScreen() {
  return (
    <section>
      <TopAppBarNavigation>
        <IconButton symbol={ArrowBackIcon} label="Back to Settings" onClick={() => navigate(SETTINGS)} />
      </TopAppBarNavigation>
      <h2>Members</h2>
    </section>
  )
}
