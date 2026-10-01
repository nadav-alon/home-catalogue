import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import type { FirebaseClient } from '../firebase/client.ts'
import { signInWithGoogle, signOutUser, watchAuthState, type AuthUser } from './authClient.ts'
import { claimHousehold, householdExists, isHouseholdMember, joinFromInvite } from './household.ts'
import { isRulesRefusal } from '../firebase/rulesRefusal.ts'
import { Button } from '../ui/Button.tsx'
import { ResetConfigButton, type ResetConfigButtonProps } from '../setup/ResetConfigButton.tsx'
import { CentredCard } from '../ui/CentredCard.tsx'

export interface AuthGateProps {
  client: FirebaseClient
  /** Forgets the stored Firebase configuration; offered on the screens a device with a bad configuration gets stuck on. */
  onResetConfig: ResetConfigButtonProps['onResetConfig']
  children: ComponentChildren
}

type AuthGateState =
  | { status: 'checking' }
  | { status: 'signed-out' }
  | { status: 'claim-available'; user: AuthUser }
  | { status: 'non-member'; user: AuthUser }
  | { status: 'unreachable'; user: AuthUser }
  | { status: 'member' }

/** Gates `children` behind Google sign-in, household first-claim, and membership. */
export function AuthGate({ client, onResetConfig, children }: AuthGateProps) {
  const [state, setState] = useState<AuthGateState>({ status: 'checking' })

  /** Counts the auth sessions seen; a lookup may set state only while it still holds the latest count. */
  const session = useRef(0)

  const resolveMembership = useCallback(
    async (user: AuthUser) => {
      const mine = session.current
      try {
        const next = await lookUpMembership(client, user)
        if (mine === session.current) setState(next)
      } catch (error) {
        if (mine !== session.current) return
        setState(isRulesRefusal(error) ? { status: 'non-member', user } : { status: 'unreachable', user })
      }
    },
    [client],
  )

  useEffect(() => {
    return watchAuthState(client.app, (user) => {
      if (user === null) {
        session.current++
        setState({ status: 'signed-out' })
        return
      }
      void resolveMembership(user)
    })
  }, [client, resolveMembership])

  switch (state.status) {
    case 'checking':
      return null

    case 'signed-out':
      return (
        <CentredCard title="Sign in">
          <Button onClick={() => void signInWithGoogle(client.app)}>Sign in with Google</Button>
          <ResetConfigRow onResetConfig={onResetConfig} />
        </CentredCard>
      )

    case 'claim-available':
      return (
        <CentredCard title="Claim this household">
          <p>No one has claimed this household yet.</p>
          <Button
            onClick={async () => {
              await claimHousehold(client.db, state.user.uid, state.user.email)
              setState({ status: 'member' })
            }}
          >
            Claim household
          </Button>
        </CentredCard>
      )

    case 'non-member':
      return (
        <CentredCard title="Not a member">
          <p>Signed in as {state.user.email}.</p>
          <p>You are not a member of this household.</p>
          <SignOutButton app={client.app} />
          <ResetConfigRow onResetConfig={onResetConfig} />
        </CentredCard>
      )

    case 'unreachable':
      return (
        <CentredCard title="Couldn't reach your Household">
          <p>Check your connection and try again.</p>
          <Button
            onClick={() => {
              setState({ status: 'checking' })
              void resolveMembership(state.user)
            }}
          >
            Retry
          </Button>
          <SignOutButton app={client.app} />
          <ResetConfigRow onResetConfig={onResetConfig} />
        </CentredCard>
      )

    case 'member':
      return <>{children}</>
  }
}

/** Resolves which gate state `user` belongs in; rejects when the Household cannot be reached. */
async function lookUpMembership(
  { db }: FirebaseClient,
  user: AuthUser,
): Promise<Extract<AuthGateState, { status: 'claim-available' | 'member' | 'non-member' }>> {
  if (!(await householdExists(db))) return { status: 'claim-available', user }
  if (await isHouseholdMember(db, user.uid)) return { status: 'member' }
  const joined = await joinFromInvite(db, user.uid, user.email)
  return joined ? { status: 'member' } : { status: 'non-member', user }
}

function SignOutButton({ app }: { app: FirebaseClient['app'] }) {
  return (
    <Button variant="tonal" onClick={() => void signOutUser(app)}>
      Sign out
    </Button>
  )
}

function ResetConfigRow({ onResetConfig }: Pick<ResetConfigButtonProps, 'onResetConfig'>) {
  return (
    <p>
      Wrong Firebase configuration? <ResetConfigButton onResetConfig={onResetConfig} />
    </p>
  )
}
