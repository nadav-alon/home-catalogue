import { useEffect, useState } from 'preact/hooks'
import type { Firestore } from 'firebase/firestore'
import type { core } from 'data-platform'
import { TopAppBarNavigation } from '../shell/TopAppBar.tsx'
import { IconButton } from '../ui/IconButton.tsx'
import { ListRow } from '../ui/ListRow.tsx'
import { route } from '../ui/route.ts'
import { navigate } from '../ui/useRoute.ts'
import ArrowBackIcon from '~icons/material-symbols/arrow-back'
import { watchInvites } from './invites.ts'
import { watchMembers, type MemberRecord } from './members.ts'

const SETTINGS = route('/settings')

export interface MembersScreenProps {
  db: Firestore
}

/** The Household's Members and pending invites, read-only; every Member can open it. */
export function MembersScreen({ db }: MembersScreenProps) {
  const [members, setMembers] = useState<MemberRecord[]>([])
  const [invites, setInvites] = useState<core.Email[]>([])

  useEffect(() => watchMembers(db, setMembers), [db])
  useEffect(() => watchInvites(db, setInvites), [db])

  return (
    <section>
      <TopAppBarNavigation>
        <IconButton symbol={ArrowBackIcon} label="Back to Settings" onClick={() => navigate(SETTINGS)} />
      </TopAppBarNavigation>
      <h2>Members</h2>
      <ul>
        {members.map((member) => (
          <ListRow key={member.uid} headline={member.email} supporting={member.isOwner ? 'Owner' : undefined} />
        ))}
      </ul>
      <h3 id="pending-invites">Pending invites</h3>
      <ul aria-labelledby="pending-invites">
        {invites.map((email) => (
          <ListRow key={email} headline={email} />
        ))}
      </ul>
    </section>
  )
}
