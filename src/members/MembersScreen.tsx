import { useEffect, useState } from 'preact/hooks'
import type { JSX } from 'preact'
import type { Firestore } from 'firebase/firestore'
import { core } from 'data-platform'
import { currentUserUid } from '../auth/authClient.ts'
import { reportFailure } from '../catalogue/writeRejections.ts'
import { TopAppBarNavigation } from '../shell/TopAppBar.tsx'
import { Button } from '../ui/Button.tsx'
import { IconButton } from '../ui/IconButton.tsx'
import { ListRow } from '../ui/ListRow.tsx'
import { TextField } from '../ui/TextField.tsx'
import { route } from '../ui/route.ts'
import { navigate } from '../ui/useRoute.ts'
import ArrowBackIcon from '~icons/material-symbols/arrow-back'
import { createInvite, revokeInvite, watchInvites } from './invites.ts'
import { removeMember, watchMembers, type MemberRecord } from './members.ts'

const SETTINGS = route('/settings')

export interface MembersScreenProps {
  db: Firestore
}

/** The Household's Members and pending Invites; every Member can open it, and only the Owner gets the controls to change them. */
export function MembersScreen({ db }: MembersScreenProps) {
  const [members, setMembers] = useState<MemberRecord[]>([])
  const [invites, setInvites] = useState<core.Email[]>([])

  // Read once per render; safe because AuthGate only mounts this screen for a signed-in Member.
  const viewerUid = currentUserUid(db.app)
  // When `meta/household` fails its schema no Member is flagged Owner, so the real Owner sees none of the Owner's controls.
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
      {viewerIsOwner && <InviteForm db={db} members={members} invites={invites} />}
      <h3 id="pending-invites">Pending invites</h3>
      <ul aria-labelledby="pending-invites">
        {invites.map((email) => (
          <ListRow
            key={email}
            headline={email}
            trailing={
              viewerIsOwner && (
                <Button variant="text" aria-label={`Revoke invite for ${email}`} onClick={() => void revokeInvite(db, email)}>
                  Revoke
                </Button>
              )
            }
          />
        ))}
      </ul>
    </section>
  )
}

const INVALID_EMAIL_MESSAGE = 'Enter a Google email address.'
const ALREADY_MEMBER_MESSAGE = 'That email is already a Member.'
const ALREADY_INVITED_MESSAGE = 'That email is already invited.'

interface InviteFormProps {
  db: Firestore
  members: MemberRecord[]
  invites: core.Email[]
}

/** Invites an email, keyed lowercased; refuses one already listed as a Member or a pending invite. */
function InviteForm({ db, members, invites }: InviteFormProps) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | undefined>(undefined)

  async function handleSubmit(event: JSX.TargetedEvent<HTMLFormElement>) {
    event.preventDefault()
    const lowercased = value.trim().toLowerCase()
    if (!core.isEmail(lowercased)) {
      setError(INVALID_EMAIL_MESSAGE)
      return
    }
    if (members.some((member) => member.email.toLowerCase() === lowercased)) {
      setError(ALREADY_MEMBER_MESSAGE)
      return
    }
    if (invites.includes(lowercased)) {
      setError(ALREADY_INVITED_MESSAGE)
      return
    }
    await createInvite(db, lowercased)
    setValue('')
    setError(undefined)
  }

  return (
    <form onSubmit={handleSubmit}>
      <TextField
        label="Invite by email"
        inputMode="email"
        value={value}
        error={error}
        onInput={(event) => setValue(event.currentTarget.value)}
      />
      <Button type="submit">Invite</Button>
    </form>
  )
}
