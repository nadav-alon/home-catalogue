import { collection, onSnapshot, type Firestore } from 'firebase/firestore'
import { core } from 'data-platform'

/**
 * Notifies `callback` with the email of every pending invite, in order. An invite is keyed by the
 * invited email, so the email is the document id. A document failing {@link core.inviteSchema} or
 * keyed by something that is not an email is skipped and logged rather than breaking the whole
 * list. Returns the unsubscribe function.
 */
export function watchInvites(db: Firestore, callback: (emails: core.Email[]) => void): () => void {
  return onSnapshot(collection(db, core.INVITES_COLLECTION), (snapshot) => {
    callback(
      snapshot.docs
        .flatMap((snapshotDoc) => {
          const parsed = core.inviteSchema.safeParse(snapshotDoc.data())
          if (!parsed.success || !core.isEmail(snapshotDoc.id)) {
            console.error(`Skipping invalid invite document ${snapshotDoc.id}`, parsed.error)
            return []
          }
          return [snapshotDoc.id]
        })
        .sort((a, b) => a.localeCompare(b)),
    )
  })
}
