import { doc, getDoc, serverTimestamp, writeBatch, type Firestore } from 'firebase/firestore'
import { core } from 'data-platform'
import { isRulesRefusal } from '../firebase/rulesRefusal.ts'

/** Whether this household's `meta/household` has been claimed by anyone yet. */
export async function householdExists(db: Firestore): Promise<boolean> {
  const snapshot = await getDoc(doc(db, core.HOUSEHOLD_DOC_PATH))
  return snapshot.exists()
}

export async function isHouseholdMember(db: Firestore, uid: core.Uid): Promise<boolean> {
  const snapshot = await getDoc(doc(db, core.memberDocPath(uid)))
  return snapshot.exists()
}

/**
 * The Member doc's shape, shared by every writer of `members/{uid}`. The rules require `email` to
 * be the caller's token email lowercased, so it is lowercased here whatever case Google reports.
 */
function memberDoc(email: core.Email) {
  return { email: core.email(email.toLowerCase()), addedAt: serverTimestamp() }
}

/** First-claim: writes `meta/household` and the claimant's `members/{uid}` doc in one batch. */
export async function claimHousehold(db: Firestore, uid: core.Uid, email: core.Email): Promise<void> {
  const batch = writeBatch(db)
  batch.set(doc(db, core.HOUSEHOLD_DOC_PATH), { owner: uid })
  batch.set(doc(db, core.memberDocPath(uid)), memberDoc(email))
  await batch.commit()
}

/**
 * Turns the invite addressed to `email` into membership: one batch creates `members/{uid}` and
 * deletes the invite. Resolves `false` when there is no invite, or when the rules refuse the join
 * (for example the invite was revoked in the meantime); any other failure rejects.
 */
export async function joinFromInvite(db: Firestore, uid: core.Uid, email: core.Email): Promise<boolean> {
  const inviteRef = doc(db, core.inviteDocPath(email))
  if (!(await getDoc(inviteRef)).exists()) return false

  const batch = writeBatch(db)
  batch.set(doc(db, core.memberDocPath(uid)), memberDoc(email))
  batch.delete(inviteRef)
  try {
    await batch.commit()
  } catch (error) {
    if (isRulesRefusal(error)) return false
    throw error
  }
  return true
}
