import { catalogue } from 'data-platform'
import { vocabulary } from './vocabulary.ts'

export interface TagRecord extends catalogue.Tag {
  id: catalogue.TagId
}

/** The refusal shown under the name field when another live Tag already has the name. */
export const TAG_NAME_TAKEN_MESSAGE = 'A Tag with this name already exists.'

/** Thrown by {@link renameTag} for the {@link TAG_NAME_TAKEN_MESSAGE} refusal, so a caller can tell it from any other throw. */
export class TagNameTakenError extends Error {}

const tags = vocabulary<catalogue.TagId, catalogue.Tag>({
  label: 'Tag',
  collection: catalogue.TAGS_COLLECTION,
  namesCollection: catalogue.TAG_NAMES_COLLECTION,
  reservationField: 'tagId',
  schema: catalogue.tagSchema,
  nameSchema: catalogue.tagSchema.pick({ name: true }),
  nameKey: catalogue.tagNameKey,
  brandId: catalogue.tagId,
  nameTakenMessage: TAG_NAME_TAKEN_MESSAGE,
  NameTakenError: TagNameTakenError,
})

/** Notifies `callback` with every live Tag, ordered by name; see {@link vocabulary}. Returns the unsubscribe function. */
export const watchTags = tags.watch

/** The live Tag among `tags` named `name`, ignoring case and surrounding spaces; undefined when none is. Throws on a name no Tag can have. */
export const findTagByName = tags.findByName

/** Writes a new Tag with the `tagNames` reservation of its name in one batch; resolves with its id once queued. See {@link vocabulary}. */
export const createTag = tags.create

/** Renames a Tag, refused with {@link TAG_NAME_TAKEN_MESSAGE} when another live Tag has the name. See {@link vocabulary}. */
export const renameTag = tags.rename

/** Soft-deletes a Tag, releasing its `tagNames` reservation; {@link restoreTag} brings it back. See {@link vocabulary}. */
export const deleteTag = tags.softDelete

/** Undoes {@link deleteTag}, refused when a live Tag has taken the name meanwhile. See {@link vocabulary}. */
export const restoreTag = tags.restore
