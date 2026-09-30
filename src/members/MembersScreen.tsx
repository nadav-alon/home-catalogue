import { useEffect, useState } from 'preact/hooks'
import type { Firestore } from 'firebase/firestore'
import type { core } from 'data-platform'
import { currentUserUid } from '../auth/authClient.ts'
import { reportFailure } from '../catalogue/writeRejections.ts'
import { TopAppBarNavigation } from '../shell/TopAppBar.tsx'
import { Button } from '../ui/Button.tsx'
import { IconButton } from '../ui/IconButton.tsx'
import { ListRow } from '../ui/ListRow.tsx'
import { route } from '../ui/route.ts'
import { navigate } from '../ui/useRoute.ts'
import ArrowBackIcon from '~icons/material-symbols/arrow-back'
import { watchInvites } from './invites.ts'
import { removeMember, watchMembers, type MemberRecord } from './members.ts'

const SETTINGS = route('/settings')

export interface MembersScreenProps {
  db: Firestore
}

/** The Household's Members and pending Invites; every Member can open it, and only the Owner can remove a Member. */
export function MembersScreen({ db }: MembersScreenProps) {
  const [members, setMembers] = useState<MemberRecord[]>([])
  const [invites, setInvites] = useState<core.Email[]>([])

  // Read once per render; safe because AuthGate only mounts this screen for a signed-in Member.
  const viewerUid = currentUserUid(db.app)
  // When `meta/household` fails its schema no Member is flagged Owner, so the real Owner sees no Remove.
  const viewerIsOwner = members.some((member) => member.isOwner && member.uid === viewerUid)

  /** The row disappears when the Members watch reports the deletion, not on click. */
  function handleRemove(member: MemberRecord) {
    if (!confirm(`Remove ${member.email} from the Household?`)) return
    removeMember(db, member.uid).catch((err: unknown) => reportFailure(`Could not remove ${member.email}`, err))
  }

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
          <ListRow
            key={member.uid}
            headline={member.email}
            supporting={member.isOwner ? 'Owner' : undefined}
            control={
              viewerIsOwner && !member.isOwner ? (
                <Button variant="text" aria-label={`Remove ${member.email}`} onClick={() => handleRemove(member)}>
                  Remove
                </Button>
              ) : undefined
            }
          />
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
