import { collection, deleteField, doc, onSnapshot, orderBy, query, serverTimestamp, writeBatch, type Firestore } from 'firebase/firestore'
import { catalogue } from 'data-platform'
import { commitQueued, reportFailure } from './writeRejections.ts'

export interface AisleRecord extends catalogue.Aisle {
  id: catalogue.AisleId
}

function toAisleRecord(id: string, data: catalogue.Aisle): AisleRecord {
  return { id: catalogue.aisleId(id), ...data }
}

/**
 * Notifies `callback` with every Aisle that isn't soft-deleted (`deletedAt` unset), ordered by
 * name. A document failing {@link catalogue.aisleSchema} is skipped and logged rather than
 * breaking the whole list. Returns the unsubscribe function.
 */
export function watchAisles(db: Firestore, callback: (aisles: AisleRecord[]) => void): () => void {
  const aislesQuery = query(collection(db, catalogue.AISLES_COLLECTION), orderBy('name'))
  return onSnapshot(aislesQuery, (snapshot) => {
    callback(
      snapshot.docs.flatMap((snapshotDoc) => {
        const parsed = catalogue.aisleSchema.safeParse(snapshotDoc.data())
        if (!parsed.success) {
          console.error(`Skipping invalid Aisle document ${snapshotDoc.id}`, parsed.error)
          return []
        }
        if (parsed.data.deletedAt !== undefined) return []
        return [toAisleRecord(snapshotDoc.id, parsed.data)]
      }),
    )
  })
}

/** The live Aisle among `aisles` named `name`, ignoring case and surrounding spaces; undefined when none is. Throws on a name no Aisle can have. */
export function findAisleByName<Aisle extends Pick<AisleRecord, 'name'>>(aisles: readonly Aisle[], name: string): Aisle | undefined {
  const key = catalogue.aisleNameKey(name)
  return aisles.find((aisle) => catalogue.aisleNameKey(aisle.name) === key)
}

/**
 * Validates `name` against {@link catalogue.aisleSchema} before writing a new Aisle together with the
 * `aisleNames` reservation of its name in one batch, as the platform's rules require. The name is
 * stored trimmed. Resolves with the new Aisle's id once the batch is queued, not once Firestore
 * acknowledges it, so a caller offline is not left waiting; a batch the server later rejects,
 * such as one whose name an Aisle created elsewhere has since taken, is reported through
 * {@link reportWriteRejection}.
 */
export async function createAisle(db: Firestore, name: string): Promise<catalogue.AisleId> {
  const data = catalogue.aisleSchema.parse({ name: name.trim() })
  const key = catalogue.aisleNameKey(data.name)
  const aisleRef = doc(collection(db, catalogue.AISLES_COLLECTION))
  const batch = writeBatch(db)
  batch.set(aisleRef, data)
  batch.set(doc(db, catalogue.AISLE_NAMES_COLLECTION, key), { aisleId: aisleRef.id })
  commitQueued(batch, `new Aisle ${data.name}`)
  return catalogue.aisleId(aisleRef.id)
}

/** The refusal shown under the name field when another live Aisle already has the name. */
export const AISLE_NAME_TAKEN_MESSAGE = 'An Aisle with this name already exists.'

/** Thrown by {@link renameAisle} for the {@link AISLE_NAME_TAKEN_MESSAGE} refusal, so a caller can tell it from any other throw. */
export class AisleNameTakenError extends Error {}

/**
 * Renames `aisle` to `name`, validated against {@link catalogue.aisleSchema} and stored trimmed. Refused
 * with {@link AISLE_NAME_TAKEN_MESSAGE}, writing nothing, when another Aisle among the live `aisles` has the
 * name, ignoring case and surrounding spaces. A name with a new key moves the `aisleNames` reservation
 * in the same batch, as the platform's rules require; one that differs only in case keeps it.
 * Resolves once queued, see {@link createAisle}.
 */
export async function renameAisle(db: Firestore, aisle: AisleRecord, name: string, aisles: readonly AisleRecord[]): Promise<void> {
  const data = catalogue.aisleSchema.pick({ name: true }).parse({ name: name.trim() })
  const taken = findAisleByName(aisles, data.name)
  if (taken !== undefined && taken.id !== aisle.id) throw new AisleNameTakenError(AISLE_NAME_TAKEN_MESSAGE)
  const batch = writeBatch(db)
  batch.update(doc(db, catalogue.AISLES_COLLECTION, aisle.id), { name: data.name })
  const oldKey = catalogue.aisleNameKey(aisle.name)
  const newKey = catalogue.aisleNameKey(data.name)
  if (oldKey !== newKey) {
    batch.delete(doc(db, catalogue.AISLE_NAMES_COLLECTION, oldKey))
    batch.set(doc(db, catalogue.AISLE_NAMES_COLLECTION, newKey), { aisleId: aisle.id })
  }
  commitQueued(batch, `rename of Aisle ${aisle.name} to ${data.name}`)
}

/**
 * Soft-deletes `aisle`: sets `deletedAt` and releases its `aisleNames` reservation in one batch. Items
 * carrying it keep its id, so {@link restoreAisle} brings it back on all of them. Resolves once queued,
 * see {@link createAisle}.
 */
export async function softDeleteAisle(db: Firestore, aisle: AisleRecord): Promise<void> {
  const batch = writeBatch(db)
  batch.update(doc(db, catalogue.AISLES_COLLECTION, aisle.id), { deletedAt: serverTimestamp() })
  batch.delete(doc(db, catalogue.AISLE_NAMES_COLLECTION, catalogue.aisleNameKey(aisle.name)))
  commitQueued(batch, `deleted Aisle ${aisle.name}`)
}

/**
 * Undoes {@link softDeleteAisle}: clears `deletedAt` and takes the name reservation again in one batch.
 * Refused, writing nothing, when a live Aisle among `aisles` has taken the name meanwhile; the refusal is
 * reported through {@link reportFailure}. Resolves once queued, see {@link createAisle}.
 */
export async function restoreAisle(db: Firestore, aisle: AisleRecord, aisles: readonly AisleRecord[]): Promise<void> {
  if (findAisleByName(aisles, aisle.name) !== undefined) {
    reportFailure(`Could not restore ${aisle.name}`, new Error(AISLE_NAME_TAKEN_MESSAGE))
    return
  }
  const batch = writeBatch(db)
  batch.update(doc(db, catalogue.AISLES_COLLECTION, aisle.id), { deletedAt: deleteField() })
  batch.set(doc(db, catalogue.AISLE_NAMES_COLLECTION, catalogue.aisleNameKey(aisle.name)), { aisleId: aisle.id })
  commitQueued(batch, `restored Aisle ${aisle.name}`)
}
