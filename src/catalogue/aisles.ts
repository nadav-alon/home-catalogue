import { catalogue } from 'data-platform'
import { vocabulary } from './vocabulary.ts'

export interface AisleRecord extends catalogue.Aisle {
  id: catalogue.AisleId
}

/** The refusal shown under the name field when another live Aisle already has the name. */
export const AISLE_NAME_TAKEN_MESSAGE = 'An Aisle with this name already exists.'

/** Thrown by {@link renameAisle} for the {@link AISLE_NAME_TAKEN_MESSAGE} refusal, so a caller can tell it from any other throw. */
export class AisleNameTakenError extends Error {}

const aisles = vocabulary<catalogue.AisleId, catalogue.Aisle>({
  label: 'Aisle',
  collection: catalogue.AISLES_COLLECTION,
  namesCollection: catalogue.AISLE_NAMES_COLLECTION,
  reservationField: 'aisleId',
  schema: catalogue.aisleSchema,
  nameSchema: catalogue.aisleSchema.pick({ name: true }),
  nameKey: catalogue.aisleNameKey,
  brandId: catalogue.aisleId,
  nameTakenMessage: AISLE_NAME_TAKEN_MESSAGE,
  NameTakenError: AisleNameTakenError,
})

/** Notifies `callback` with every live Aisle, ordered by name; see {@link vocabulary}. Returns the unsubscribe function. */
export const watchAisles = aisles.watch

/** The live Aisle among `aisles` named `name`, ignoring case and surrounding spaces; undefined when none is. Throws on a name no Aisle can have. */
export const findAisleByName = aisles.findByName

/** Writes a new Aisle with the `aisleNames` reservation of its name in one batch; resolves with its id once queued. See {@link vocabulary}. */
export const createAisle = aisles.create

/** Renames an Aisle, refused with {@link AISLE_NAME_TAKEN_MESSAGE} when another live Aisle has the name. See {@link vocabulary}. */
export const renameAisle = aisles.rename

/** Soft-deletes an Aisle, releasing its `aisleNames` reservation; {@link restoreAisle} brings it back. See {@link vocabulary}. */
export const softDeleteAisle = aisles.softDelete

/** Undoes {@link softDeleteAisle}, refused when a live Aisle has taken the name meanwhile. See {@link vocabulary}. */
export const restoreAisle = aisles.restore
