import { collection, doc, onSnapshot, type Firestore } from 'firebase/firestore'
import { core } from 'data-platform'

export interface MemberRecord extends core.Member {
  uid: core.Uid
  isOwner: boolean
}

/**
 * Notifies `callback` with every Member, ordered by email, the Household's Owner flagged. Waits
 * until both the Members and the Household have arrived. A Member document failing
 * {@link core.memberSchema}, or keyed by something that is not a Uid, is skipped and logged rather
 * than breaking the whole list. A Household document failing {@link core.householdMetaSchema} is
 * logged and no one is flagged Owner. Returns the unsubscribe function.
 */
export function watchMembers(db: Firestore, callback: (members: MemberRecord[]) => void): () => void {
  let members: Omit<MemberRecord, 'isOwner'>[] | null = null
  let household: { owner: core.Uid | null } | null = null

  function publish() {
    if (members === null || household === null) return
    const { owner } = household
    callback(
      members
        .map((member) => ({ ...member, isOwner: member.uid === owner }))
        .sort((a, b) => a.email.localeCompare(b.email)),
    )
  }

  const stopMembers = onSnapshot(collection(db, core.MEMBERS_COLLECTION), (snapshot) => {
    members = snapshot.docs.flatMap((snapshotDoc) => {
      const parsed = core.memberSchema.safeParse(snapshotDoc.data())
      if (!parsed.success || !core.isUid(snapshotDoc.id)) {
        console.error(`Skipping invalid Member document ${snapshotDoc.id}`, parsed.error)
        return []
      }
      return [{ ...parsed.data, uid: snapshotDoc.id }]
    })
    publish()
  })
  const stopHousehold = onSnapshot(doc(db, core.HOUSEHOLD_DOC_PATH), (snapshot) => {
    const parsed = core.householdMetaSchema.safeParse(snapshot.data())
    if (!parsed.success) console.error('Invalid Household document, flagging no Owner', parsed.error)
    household = { owner: parsed.success ? parsed.data.owner : null }
    publish()
  })

  return () => {
    stopMembers()
    stopHousehold()
  }
}
