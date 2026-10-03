import { collection, doc, onSnapshot, orderBy, query, writeBatch, type Firestore } from 'firebase/firestore'
import { catalogue } from 'data-platform'
import { reportWriteRejection } from './writeRejections.ts'

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
  void batch.commit().catch((err: unknown) => {
    reportWriteRejection(`new Tag ${data.name}`, err)
  })
  return catalogue.tagId(tagRef.id)
}
