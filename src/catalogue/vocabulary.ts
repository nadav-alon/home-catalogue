import { collection, deleteField, doc, onSnapshot, orderBy, query, serverTimestamp, writeBatch, type Firestore } from 'firebase/firestore'
import { commitQueued, reportFailure } from './writeRejections.ts'

/** The part of a zod schema the vocabulary writes use. */
interface Parser<Data> {
  parse: (value: unknown) => Data
  safeParse: (value: unknown) => { success: true; data: Data } | { success: false; error: unknown }
}

/** What differs between the household-wide vocabularies (Tags, Aisles) that otherwise share their writes. */
export interface VocabularyConfig<Id extends string, Data extends { name: string; deletedAt?: unknown }> {
  /** The singular name used in log and failure messages, e.g. `Tag`. */
  label: string
  collection: string
  /** The collection holding the name reservations. */
  namesCollection: string
  /** The field of a reservation that points back at its entry. */
  reservationField: string
  schema: Parser<Data>
  /** The schema narrowed to the `name` field, which a rename validates alone. */
  nameSchema: { parse: (value: unknown) => { name: string } }
  nameKey: (name: string) => string
  brandId: (id: string) => Id
  /** The refusal shown under the name field when another live entry already has the name. */
  nameTakenMessage: string
  /** Thrown by `rename` for the `nameTakenMessage` refusal, so a caller can tell it from any other throw. */
  NameTakenError: new (message: string) => Error
}

/**
 * The watch, find, create, rename, soft-delete and restore writes of a vocabulary of named
 * entries, each reserving its name in a second collection in the same batch, as the platform's
 * rules require. {@link VocabularyConfig} supplies what differs between vocabularies.
 */
export function vocabulary<Id extends string, Data extends { name: string; deletedAt?: unknown }>(config: VocabularyConfig<Id, Data>) {
  type Entry = Data & { id: Id }
  const { label, nameKey } = config

  function toRecord(id: string, data: Data): Entry {
    return { id: config.brandId(id), ...data }
  }

  /**
   * Notifies `callback` with every entry that isn't soft-deleted (`deletedAt` unset), ordered by
   * name. A document failing the schema is skipped and logged rather than breaking the whole
   * list. Returns the unsubscribe function.
   */
  function watch(db: Firestore, callback: (entries: Entry[]) => void): () => void {
    const entriesQuery = query(collection(db, config.collection), orderBy('name'))
    return onSnapshot(entriesQuery, (snapshot) => {
      callback(
        snapshot.docs.flatMap((snapshotDoc) => {
          const parsed = config.schema.safeParse(snapshotDoc.data())
          if (!parsed.success) {
            console.error(`Skipping invalid ${label} document ${snapshotDoc.id}`, parsed.error)
            return []
          }
          if (parsed.data.deletedAt !== undefined) return []
          return [toRecord(snapshotDoc.id, parsed.data)]
        }),
      )
    })
  }

  /** The live entry among `entries` named `name`, ignoring case and surrounding spaces; undefined when none is. Throws on a name no entry can have. */
  function findByName<Found extends { name: string }>(entries: readonly Found[], name: string): Found | undefined {
    const key = nameKey(name)
    return entries.find((entry) => nameKey(entry.name) === key)
  }

  /**
   * Validates `name` against the schema before writing a new entry together with the reservation
   * of its name in one batch. The name is stored trimmed. Resolves with the new entry's id once
   * the batch is queued, not once Firestore acknowledges it, so a caller offline is not left
   * waiting; a batch the server later rejects, such as one whose name an entry created elsewhere
   * has since taken, is reported through `reportWriteRejection`.
   */
  async function create(db: Firestore, name: string): Promise<Id> {
    const data = config.schema.parse({ name: name.trim() })
    const key = nameKey(data.name)
    const ref = doc(collection(db, config.collection))
    const batch = writeBatch(db)
    batch.set(ref, data)
    batch.set(doc(db, config.namesCollection, key), { [config.reservationField]: ref.id })
    commitQueued(batch, `new ${label} ${data.name}`)
    return config.brandId(ref.id)
  }

  /**
   * Renames `entry` to `name`, validated against the schema and stored trimmed. Refused with the
   * name-taken message, writing nothing, when another entry among the live `entries` has the
   * name, ignoring case and surrounding spaces. A name with a new key moves the reservation in
   * the same batch; one that differs only in case keeps it. Resolves once queued, see {@link create}.
   */
  async function rename(db: Firestore, entry: Entry, name: string, entries: readonly Entry[]): Promise<void> {
    const data = config.nameSchema.parse({ name: name.trim() })
    const taken = findByName(entries, data.name)
    if (taken !== undefined && taken.id !== entry.id) throw new config.NameTakenError(config.nameTakenMessage)
    const batch = writeBatch(db)
    batch.update(doc(db, config.collection, entry.id), { name: data.name })
    const oldKey = nameKey(entry.name)
    const newKey = nameKey(data.name)
    if (oldKey !== newKey) {
      batch.delete(doc(db, config.namesCollection, oldKey))
      batch.set(doc(db, config.namesCollection, newKey), { [config.reservationField]: entry.id })
    }
    commitQueued(batch, `rename of ${label} ${entry.name} to ${data.name}`)
  }

  /**
   * Soft-deletes `entry`: sets `deletedAt` and releases its reservation in one batch. Items
   * carrying it keep its id, so {@link restore} brings it back on all of them. Resolves once
   * queued, see {@link create}.
   */
  async function softDelete(db: Firestore, entry: Entry): Promise<void> {
    const batch = writeBatch(db)
    batch.update(doc(db, config.collection, entry.id), { deletedAt: serverTimestamp() })
    batch.delete(doc(db, config.namesCollection, nameKey(entry.name)))
    commitQueued(batch, `deleted ${label} ${entry.name}`)
  }

  /**
   * Undoes {@link softDelete}: clears `deletedAt` and takes the name reservation again in one
   * batch. Refused, writing nothing, when a live entry among `entries` has taken the name
   * meanwhile; the refusal is reported through `reportFailure`. Resolves once queued, see {@link create}.
   */
  async function restore(db: Firestore, entry: Entry, entries: readonly Entry[]): Promise<void> {
    if (findByName(entries, entry.name) !== undefined) {
      reportFailure(`Could not restore ${entry.name}`, new Error(config.nameTakenMessage))
      return
    }
    const batch = writeBatch(db)
    batch.update(doc(db, config.collection, entry.id), { deletedAt: deleteField() })
    batch.set(doc(db, config.namesCollection, nameKey(entry.name)), { [config.reservationField]: entry.id })
    commitQueued(batch, `restored ${label} ${entry.name}`)
  }

  return { watch, findByName, create, rename, softDelete, restore }
}
