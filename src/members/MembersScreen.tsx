import { useEffect, useState } from 'preact/hooks'
import type { JSX } from 'preact'
import type { Firestore } from 'firebase/firestore'
import { core } from 'data-platform'
import { currentUserUid } from '../auth/authClient.ts'
import { reportFailure } from '../catalogue/writeRejections.ts'
import type { FirebaseWebConfig } from '../firebase/webConfig.ts'
import { TopAppBarNavigation } from '../shell/TopAppBar.tsx'
import { showSnackbar } from '../ui/Snackbar.tsx'
import { Button } from '../ui/Button.tsx'
import { IconButton } from '../ui/IconButton.tsx'
import { ListRow } from '../ui/ListRow.tsx'
import { TextField } from '../ui/TextField.tsx'
import { route } from '../ui/route.ts'
import { navigate } from '../ui/useRoute.ts'
import ArrowBackIcon from '~icons/material-symbols/arrow-back'
import { DeviceTransferQrCode } from '../firebase/DeviceTransferQrCode.tsx'
import { inviteShareMessage } from './shareInvite.ts'
import { createInvite, inviteKey, revokeInvite, watchInvites } from './invites.ts'
import { removeMember, watchMembers, type MemberRecord } from './members.ts'

const SETTINGS = route('/settings')

export interface MembersScreenProps {
  db: Firestore
  /** The Firebase config an invite's shared link carries, so the invitee's device sets itself up. */
  config: FirebaseWebConfig
}

/** The Household's Members and pending Invites; every Member can open it, and only the Owner gets the controls to change them. */
export function MembersScreen({ db, config }: MembersScreenProps) {
  const [members, setMembers] = useState<MemberRecord[]>([])
  const [invites, setInvites] = useState<core.Email[] | undefined>(undefined)
  const [qrInviteEmail, setQrInviteEmail] = useState<core.Email | null>(null)

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
      <ul>
        {ownerFirst(members).map((member) => (
          <ListRow
            key={member.uid}
            headline={member.email}
            supporting={memberSupportingText(member, viewerUid)}
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
      {viewerIsOwner && <InviteForm db={db} members={members} invites={invites ?? []} />}
      <h3 id="pending-invites">Pending invites</h3>
      {invites?.length === 0 && <p>No pending invites.</p>}
      {invites !== undefined && invites.length > 0 && (
        <ul aria-labelledby="pending-invites">
          {invites.map((email) => (
            <ListRow
              key={email}
              headline={email}
              trailing={
                viewerIsOwner && (
                  <>
                    <Button
                      variant="text"
                      aria-label={`Share invite for ${email}`}
                      onClick={() => void shareInvite(config, email, setQrInviteEmail)}
                    >
                      Share
                    </Button>
                    <Button
                      variant="text"
                      aria-label={`Revoke invite for ${email}`}
                      onClick={() => {
                        if (qrInviteEmail === email) setQrInviteEmail(null)
                        void revokeInvite(db, email).then(() => showSnackbar({ text: `Revoked invite for ${email}` }))
                      }}
                    >
                      Revoke
                    </Button>
                  </>
                )
              }
            />
          ))}
        </ul>
      )}
      {qrInviteEmail !== null && (
        <div>
          <DeviceTransferQrCode config={config} label={`Scan with the device of ${qrInviteEmail} to join`} />
          <Button variant="text" onClick={() => setQrInviteEmail(null)}>
            Close QR code
          </Button>
        </div>
      )}
    </section>
  )
}

/** The Owner ahead of the other Members, who keep their order. */
function ownerFirst(members: MemberRecord[]): MemberRecord[] {
  return [...members.filter((member) => member.isOwner), ...members.filter((member) => !member.isOwner)]
}

/** The supporting text under a Member's email: "Owner" and "you" (the signed-in Member); `undefined` when neither applies. */
function memberSupportingText(member: MemberRecord, viewerUid: core.Uid | null): string | undefined {
  const labels = [member.isOwner ? 'Owner' : null, member.uid === viewerUid ? 'you' : null].filter((label) => label !== null)
  return labels.length > 0 ? labels.join(' · ') : undefined
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
    const key = inviteKey(value)
    if (key === null) {
      setError(INVALID_EMAIL_MESSAGE)
      return
    }
    if (members.some((member) => inviteKey(member.email) === key)) {
      setError(ALREADY_MEMBER_MESSAGE)
      return
    }
    if (invites.includes(key)) {
      setError(ALREADY_INVITED_MESSAGE)
      return
    }
    await createInvite(db, key)
    showSnackbar({ text: `Invited ${key}` })
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
        onInput={(event) => {
          setValue(event.currentTarget.value)
          setError(undefined)
        }}
      />
      <Button type="submit">Invite</Button>
    </form>
  )
}

/**
 * Opens the share sheet with the invite link; where `navigator.share` is missing, asks for the QR
 * code to be shown instead. The user dismissing the sheet is not a failure.
 */
async function shareInvite(config: FirebaseWebConfig, email: core.Email, showQr: (email: core.Email) => void) {
  if (typeof navigator.share !== 'function') {
    showQr(email)
    return
  }
  try {
    await navigator.share({ text: inviteShareMessage(config) })
  } catch (err) {
    if (!(err instanceof DOMException && err.name === 'AbortError')) showQr(email)
  }
}
