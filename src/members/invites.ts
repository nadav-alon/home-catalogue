import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, type Firestore } from 'firebase/firestore'
import { core } from 'data-platform'
import { reportWriteRejection } from '../catalogue/writeRejections.ts'

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

/**
 * The key an invite to `value` is stored under: the trimmed, lowercased address, or `null` when
 * that is not an email. Every invite and every comparison against one goes through it, so two
 * spellings of one address can't be two invites.
 */
export function inviteKey(value: string): core.Email | null {
  const key = value.trim().toLowerCase()
  return core.isEmail(key) ? key : null
}

/**
 * Invites `email` by writing `invites/{email}` with `invitedAt` set to the server's commit time.
 * Resolves once the write is queued, not once Firestore acknowledges it; a write the rules refuse
 * is reported through {@link reportWriteRejection}.
 */
export async function createInvite(db: Firestore, email: core.Email): Promise<void> {
  void setDoc(doc(db, core.inviteDocPath(email)), { invitedAt: serverTimestamp() }).catch((err: unknown) => {
    reportWriteRejection(`invite for ${email}`, err)
  })
}

/** Revokes the pending invite to `email` by deleting it. Resolves once queued, see {@link createInvite}. */
export async function revokeInvite(db: Firestore, email: core.Email): Promise<void> {
  void deleteDoc(doc(db, core.inviteDocPath(email))).catch((err: unknown) => {
    reportWriteRejection(`revoke of invite for ${email}`, err)
  })
}
