import { FirebaseError } from 'firebase/app'

/** Whether `err` is Firestore's rules denying the write, as opposed to a network or programming error. */
export function isRulesRefusal(err: unknown): boolean {
  return err instanceof FirebaseError && err.code === 'permission-denied'
}
