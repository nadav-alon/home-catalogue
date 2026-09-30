import { collection, doc, onSnapshot, type Firestore } from 'firebase/firestore'
import { core } from 'data-platform'

export interface MemberRecord {
  uid: core.Uid
  email: core.Email
  isOwner: boolean
}

/**
 * Notifies `callback` with every Member, ordered by email, the Household's Owner flagged. Waits
 * until both the Members and the Household have arrived. A document failing
 * {@link core.memberSchema} is skipped and logged rather than breaking the whole list. Returns the
 * unsubscribe function.
 */
export function watchMembers(db: Firestore, callback: (members: MemberRecord[]) => void): () => void {
  let members: { uid: core.Uid; email: core.Email }[] | null = null
  let owner: core.Uid | null = null

  function publish() {
    if (members === null || owner === null) return
    const ownerUid = owner
    callback(
      members
        .map((member) => ({ ...member, isOwner: member.uid === ownerUid }))
        .sort((a, b) => a.email.localeCompare(b.email)),
    )
  }

  const stopMembers = onSnapshot(collection(db, core.MEMBERS_COLLECTION), (snapshot) => {
    members = snapshot.docs.flatMap((snapshotDoc) => {
      const parsed = core.memberSchema.safeParse(snapshotDoc.data())
      if (!parsed.success) {
        console.error(`Skipping invalid Member document ${snapshotDoc.id}`, parsed.error)
        return []
      }
      return [{ uid: core.uid(snapshotDoc.id), email: parsed.data.email }]
    })
    publish()
  })
  const stopHousehold = onSnapshot(doc(db, core.HOUSEHOLD_DOC_PATH), (snapshot) => {
    const parsed = core.householdMetaSchema.safeParse(snapshot.data())
    if (!parsed.success) {
      console.error('Skipping invalid Household document', parsed.error)
      return
    }
    owner = parsed.data.owner
    publish()
  })

  return () => {
    stopMembers()
    stopHousehold()
  }
}
