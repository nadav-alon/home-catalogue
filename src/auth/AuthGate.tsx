import { useEffect, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import type { FirebaseClient } from '../firebase/client.ts'
import { signInWithGoogle, signOutUser, watchAuthState, type AuthUser } from './authClient.ts'
import { claimHousehold, householdExists, isHouseholdMember } from './household.ts'
import { Button } from '../ui/Button.tsx'
import { CentredCard } from '../ui/CentredCard.tsx'

export interface AuthGateProps {
  client: FirebaseClient
  children: ComponentChildren
}

type AuthGateState =
  | { status: 'checking' }
  | { status: 'signed-out' }
  | { status: 'claim-available'; user: AuthUser }
  | { status: 'non-member'; user: AuthUser }
  | { status: 'member' }

/** Gates `children` behind Google sign-in, household first-claim, and membership. */
export function AuthGate({ client, children }: AuthGateProps) {
  const [state, setState] = useState<AuthGateState>({ status: 'checking' })

  useEffect(() => {
    return watchAuthState(client.app, (user) => {
      if (user === null) {
        setState({ status: 'signed-out' })
        return
      }
      void resolveMembership(user)
    })

    async function resolveMembership(user: AuthUser) {
      if (!(await householdExists(client.db))) {
        setState({ status: 'claim-available', user })
        return
      }
      const member = await isHouseholdMember(client.db, user.uid)
      setState(member ? { status: 'member' } : { status: 'non-member', user })
    }
  }, [client])

  switch (state.status) {
    case 'checking':
      return null

    case 'signed-out':
      return (
        <CentredCard title="Sign in">
          <Button onClick={() => void signInWithGoogle(client.app)}>Sign in with Google</Button>
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
        </CentredCard>
      )

    case 'member':
      return <>{children}</>
  }
}

function SignOutButton({ app }: { app: FirebaseClient['app'] }) {
  return (
    <Button variant="tonal" onClick={() => void signOutUser(app)}>
      Sign out
    </Button>
  )
}
