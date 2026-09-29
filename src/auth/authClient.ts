import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'
import type { FirebaseApp } from 'firebase/app'
import { core } from 'data-platform'

export interface AuthUser {
  uid: core.Uid
  email: core.Email
}

function toAuthUser(user: User): AuthUser {
  if (user.email === null) {
    throw new Error(`Signed-in user ${user.uid} has no email`)
  }
  return { uid: core.uid(user.uid), email: core.email(user.email) }
}

/** Opens the Google sign-in popup; resolves with the signed-in user once it completes. */
export async function signInWithGoogle(app: FirebaseApp): Promise<AuthUser> {
  const credential = await signInWithPopup(getAuth(app), new GoogleAuthProvider())
  return toAuthUser(credential.user)
}

export async function signOutUser(app: FirebaseApp): Promise<void> {
  await signOut(getAuth(app))
}

/** Notifies `callback` with the signed-in user, or `null` when signed out. Returns the unsubscribe function. */
export function watchAuthState(app: FirebaseApp, callback: (user: AuthUser | null) => void): () => void {
  return onAuthStateChanged(getAuth(app), (user) => {
    callback(user === null ? null : toAuthUser(user))
  })
}
