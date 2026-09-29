import { useEffect, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import type { FirebaseClient } from '../firebase/client.ts'
import { signInWithGoogle, signOutUser, watchAuthState, type AuthUser } from './authClient.ts'
import { claimHousehold, householdExists, isHouseholdMember } from './household.ts'

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
        <main>
          <h1>Sign in</h1>
          <button type="button" onClick={() => void signInWithGoogle(client.app)}>
            Sign in with Google
          </button>
        </main>
      )

    case 'claim-available':
      return (
        <main>
          <h1>Claim this household</h1>
          <p>No one has claimed this household yet.</p>
          <button
            type="button"
            onClick={async () => {
              await claimHousehold(client.db, state.user.uid, state.user.email)
              setState({ status: 'member' })
            }}
          >
            Claim household
          </button>
        </main>
      )

    case 'non-member':
      return (
        <main>
          <h1>Not a member</h1>
          <p>Signed in as {state.user.email}.</p>
          <p>You are not a member of this household.</p>
          <SignOutButton app={client.app} />
        </main>
      )

    case 'member':
      return (
        <>
          {children}
          <SignOutButton app={client.app} />
        </>
      )
  }
}

function SignOutButton({ app }: { app: FirebaseClient['app'] }) {
  return (
    <button type="button" onClick={() => void signOutUser(app)}>
      Sign out
    </button>
  )
}
