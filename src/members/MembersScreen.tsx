import { useEffect, useState } from 'preact/hooks'
import type { Firestore } from 'firebase/firestore'
import { TopAppBarNavigation } from '../shell/TopAppBar.tsx'
import { IconButton } from '../ui/IconButton.tsx'
import { ListRow } from '../ui/ListRow.tsx'
import { route } from '../ui/route.ts'
import { navigate } from '../ui/useRoute.ts'
import ArrowBackIcon from '~icons/material-symbols/arrow-back'
import { watchMembers, type MemberRecord } from './members.ts'

const SETTINGS = route('/settings')

export interface MembersScreenProps {
  db: Firestore
}

/** The Household's Members and pending invites, read-only; every Member can open it. */
export function MembersScreen({ db }: MembersScreenProps) {
  const [members, setMembers] = useState<MemberRecord[]>([])

  useEffect(() => watchMembers(db, setMembers), [db])

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
    </section>
  )
}
