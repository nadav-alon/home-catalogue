import { collection, deleteField, doc, onSnapshot, orderBy, query, serverTimestamp, writeBatch, type Firestore, type WriteBatch } from 'firebase/firestore'
import { catalogue } from 'data-platform'
import { reportFailure, reportWriteRejection } from './writeRejections.ts'

export interface TagRecord extends catalogue.Tag {
  id: catalogue.TagId
}

function toTagRecord(id: string, data: catalogue.Tag): TagRecord {
  return { id: catalogue.tagId(id), ...data }
}

/**
 * Notifies `callback` with every Tag that isn't soft-deleted (`deletedAt` unset), ordered by
 * name. A document failing {@link catalogue.tagSchema} is skipped and logged rather than
 * breaking the whole list. Returns the unsubscribe function.
 */
export function watchTags(db: Firestore, callback: (tags: TagRecord[]) => void): () => void {
  const tagsQuery = query(collection(db, catalogue.TAGS_COLLECTION), orderBy('name'))
  return onSnapshot(tagsQuery, (snapshot) => {
    callback(
      snapshot.docs.flatMap((snapshotDoc) => {
        const parsed = catalogue.tagSchema.safeParse(snapshotDoc.data())
        if (!parsed.success) {
          console.error(`Skipping invalid Tag document ${snapshotDoc.id}`, parsed.error)
          return []
        }
        if (parsed.data.deletedAt !== undefined) return []
        return [toTagRecord(snapshotDoc.id, parsed.data)]
      }),
    )
  })
}

/** The live Tag among `tags` named `name`, ignoring case and surrounding spaces; undefined when none is. Throws on a name no Tag can have. */
export function findTagByName<Tag extends Pick<TagRecord, 'name'>>(tags: readonly Tag[], name: string): Tag | undefined {
  const key = catalogue.tagNameKey(name)
  return tags.find((tag) => catalogue.tagNameKey(tag.name) === key)
}

/** Commits `batch` without awaiting it; a rejection is reported through {@link reportWriteRejection} as `what`. */
function commitQueued(batch: WriteBatch, what: string): void {
  void batch.commit().catch((err: unknown) => {
    reportWriteRejection(what, err)
  })
}

/**
 * Validates `name` against {@link catalogue.tagSchema} before writing a new Tag together with the
 * `tagNames` reservation of its name in one batch, as the platform's rules require. The name is
 * stored trimmed. Resolves with the new Tag's id once the batch is queued, not once Firestore
 * acknowledges it, so a caller offline is not left waiting; a batch the server later rejects,
 * such as one whose name a Tag created elsewhere has since taken, is reported through
 * {@link reportWriteRejection}.
 */
export async function createTag(db: Firestore, name: string): Promise<catalogue.TagId> {
  const data = catalogue.tagSchema.parse({ name: name.trim() })
  const key = catalogue.tagNameKey(data.name)
  const tagRef = doc(collection(db, catalogue.TAGS_COLLECTION))
  const batch = writeBatch(db)
  batch.set(tagRef, data)
  batch.set(doc(db, catalogue.TAG_NAMES_COLLECTION, key), { tagId: tagRef.id })
  commitQueued(batch, `new Tag ${data.name}`)
  return catalogue.tagId(tagRef.id)
}

/** The refusal shown under the name field when another live Tag already has the name. */
export const TAG_NAME_TAKEN_MESSAGE = 'A Tag with this name already exists.'

/** Thrown by {@link renameTag} for the {@link TAG_NAME_TAKEN_MESSAGE} refusal, so a caller can tell it from any other throw. */
export class TagNameTakenError extends Error {}

/**
 * Renames `tag` to `name`, validated against {@link catalogue.tagSchema} and stored trimmed. Refused
 * with {@link TAG_NAME_TAKEN_MESSAGE}, writing nothing, when another Tag among the live `tags` has the
 * name, ignoring case and surrounding spaces. A name with a new key moves the `tagNames` reservation
 * in the same batch, as the platform's rules require; one that differs only in case keeps it.
 * Resolves once queued, see {@link createTag}.
 */
export async function renameTag(db: Firestore, tag: TagRecord, name: string, tags: readonly TagRecord[]): Promise<void> {
  const data = catalogue.tagSchema.pick({ name: true }).parse({ name: name.trim() })
  const taken = findTagByName(tags, data.name)
  if (taken !== undefined && taken.id !== tag.id) throw new TagNameTakenError(TAG_NAME_TAKEN_MESSAGE)
  const batch = writeBatch(db)
  batch.update(doc(db, catalogue.TAGS_COLLECTION, tag.id), { name: data.name })
  const oldKey = catalogue.tagNameKey(tag.name)
  const newKey = catalogue.tagNameKey(data.name)
  if (oldKey !== newKey) {
    batch.delete(doc(db, catalogue.TAG_NAMES_COLLECTION, oldKey))
    batch.set(doc(db, catalogue.TAG_NAMES_COLLECTION, newKey), { tagId: tag.id })
  }
  commitQueued(batch, `rename of Tag ${tag.name} to ${data.name}`)
}

/**
 * Soft-deletes `tag`: sets `deletedAt` and releases its `tagNames` reservation in one batch. Items
 * carrying it keep its id, so {@link restoreTag} brings it back on all of them. Resolves once queued,
 * see {@link createTag}.
 */
export async function deleteTag(db: Firestore, tag: TagRecord): Promise<void> {
  const batch = writeBatch(db)
  batch.update(doc(db, catalogue.TAGS_COLLECTION, tag.id), { deletedAt: serverTimestamp() })
  batch.delete(doc(db, catalogue.TAG_NAMES_COLLECTION, catalogue.tagNameKey(tag.name)))
  commitQueued(batch, `deleted Tag ${tag.name}`)
}

/**
 * Undoes {@link deleteTag}: clears `deletedAt` and takes the name reservation again in one batch.
 * Refused, writing nothing, when a live Tag among `tags` has taken the name meanwhile; the refusal is
 * reported through {@link reportFailure}. Resolves once queued, see {@link createTag}.
 */
export async function restoreTag(db: Firestore, tag: TagRecord, tags: readonly TagRecord[]): Promise<void> {
  if (findTagByName(tags, tag.name) !== undefined) {
    reportFailure(`Could not restore ${tag.name}`, new Error(TAG_NAME_TAKEN_MESSAGE))
    return
  }
  const batch = writeBatch(db)
  batch.update(doc(db, catalogue.TAGS_COLLECTION, tag.id), { deletedAt: deleteField() })
  batch.set(doc(db, catalogue.TAG_NAMES_COLLECTION, catalogue.tagNameKey(tag.name)), { tagId: tag.id })
  commitQueued(batch, `restored Tag ${tag.name}`)
}
