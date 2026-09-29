import { doc, getDoc, serverTimestamp, writeBatch, type Firestore } from 'firebase/firestore'
import { core } from 'data-platform'

/** Whether this household's `meta/household` has been claimed by anyone yet. */
export async function householdExists(db: Firestore): Promise<boolean> {
  const snapshot = await getDoc(doc(db, core.HOUSEHOLD_DOC_PATH))
  return snapshot.exists()
}

export async function isHouseholdMember(db: Firestore, uid: core.Uid): Promise<boolean> {
  const snapshot = await getDoc(doc(db, core.memberDocPath(uid)))
  return snapshot.exists()
}

/** First-claim: writes `meta/household` and the claimant's `members/{uid}` doc in one batch. */
export async function claimHousehold(db: Firestore, uid: core.Uid, email: core.Email): Promise<void> {
  const batch = writeBatch(db)
  batch.set(doc(db, core.HOUSEHOLD_DOC_PATH), { owner: uid })
  batch.set(doc(db, core.memberDocPath(uid)), { email, addedAt: serverTimestamp() })
  await batch.commit()
}
