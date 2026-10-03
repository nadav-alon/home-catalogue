import { useState } from 'preact/hooks'
import type { JSX } from 'preact'
import { catalogue, core } from 'data-platform'
import { isLiveReference, type ItemEdit, type ItemInput, type ItemRecord } from './items.ts'
import { findTagByName, type TagRecord } from './tags.ts'
import { validateCategoryDraft, type CategoryDraft, type CategoryRecord } from './categories.ts'
import type { ShopRecord } from './shops.ts'
import { Button } from '../ui/Button.tsx'
import { IconButton } from '../ui/IconButton.tsx'
import { Chip } from '../ui/Chip.tsx'
import { Dialog } from '../ui/Dialog.tsx'
import { DialogActions } from '../ui/DialogActions.tsx'
import { Select } from '../ui/Select.tsx'
import { TextField } from '../ui/TextField.tsx'
import CloseIcon from '~icons/material-symbols/close'
import './ItemDialog.css'

/** What saving carries: an added Item the `state` it starts at, an edited or restored one only its edit. */
export type ItemSave = (ItemEdit & { state?: undefined }) | (ItemInput & { state: core.State })

export interface ItemDialogProps {
  open: boolean
  /** The Item being edited; without one the dialog adds an Item. */
  item?: ItemRecord
  /** The Item is deleted and saving restores it; its Category and Shop override that are gone then start unset for the Member to choose again. */
  restoring?: boolean
  /** The scanned Barcode the new Item will carry, shown read-only; ignored when editing. */
  barcode?: core.Barcode
  categories: CategoryRecord[]
  shops: ShopRecord[]
  /** The live Tags; an id on the Item that names none of them is a deleted Tag and shows no chip. */
  tags: TagRecord[]
  /** Creates a Category and resolves with its id; a rejection is shown in the dialog's Category prompt. */
  onCreateCategory: (name: string, defaultShopId: catalogue.ShopId) => Promise<catalogue.CategoryId>
  /** Creates a Tag named `name` and resolves with its id; a rejection is shown under the Tags field. */
  onCreateTag: (name: string) => Promise<catalogue.TagId>
  /**
   * Called with the validated fields, and the Item's Barcodes the Member removed, when they save; a rejection
   * is shown in the dialog and keeps it open. Only an added Item carries the `state` it starts at.
   */
  onSave: (input: ItemSave) => Promise<void>
  /**
   * Called when they delete the Item being edited, just before the dialog closes; the Delete button shows only when
   * editing and this is given, so a dialog restoring a deleted Item omits it.
   */
  onDelete?: (item: ItemRecord) => void
  onClose: () => void
}

const NO_SHOP_OVERRIDE = ''
/** The Category picker's value for "+ New Category"; never a Category id. */
const NEW_CATEGORY = '+new'

interface ItemFormValues {
  name: string
  brandNote: string
  categoryId: string
  necessity: string
  shopId: string
  /** The State an added Item starts at; unused when editing. */
  state: core.State
}

type ItemFormErrors = Partial<Record<'name' | 'categoryId' | 'necessity', string>>

function isErrorField(field: string): field is keyof ItemFormErrors {
  return field === 'name' || field === 'categoryId' || field === 'necessity'
}

function parseItemFormValues(values: ItemFormValues): { input: ItemInput } | { errors: ItemFormErrors } {
  const trimmedName = values.name.trim()
  const necessity = catalogue.necessitySchema.safeParse(values.necessity)
  const categoryId = catalogue.isCategoryId(values.categoryId) ? values.categoryId : undefined
  const errors: ItemFormErrors = {}
  if (trimmedName.length === 0) errors.name = 'An Item needs a name.'
  if (categoryId === undefined) errors.categoryId = 'Choose a Category.'
  if (!necessity.success) errors.necessity = 'Choose a Necessity.'
  // Narrows `categoryId` and `necessity`; `errors` is non-empty whenever either is missing.
  if (Object.keys(errors).length > 0 || categoryId === undefined || !necessity.success) return { errors }
  const trimmedBrandNote = values.brandNote.trim()
  return {
    input: {
      name: trimmedName,
      brandNote: trimmedBrandNote.length === 0 ? undefined : trimmedBrandNote,
      categoryId,
      necessity: necessity.data,
      shopId: catalogue.isShopId(values.shopId) ? values.shopId : undefined,
    },
  }
}

/** The form for an Item's name, brand note, Category, Necessity, Shop override and Tags, plus its State when adding, plus its Barcodes when editing or, when adding from a scan, the pending `barcode` shown read-only, in a dialog that starts from `item`, or empty, on each open. */
export function ItemDialog({ open, item, restoring, barcode, categories, shops, tags, onCreateCategory, onCreateTag, onSave, onDelete, onClose }: ItemDialogProps) {
  return (
    <Dialog open={open} title={restoring ? 'Restore Item' : item ? 'Edit Item' : 'Add Item'} onClose={onClose} closable>
      {open && (
        <ItemForm
          item={item}
          restoring={restoring}
          barcode={barcode}
          categories={categories}
          shops={shops}
          tags={tags}
          onCreateCategory={onCreateCategory}
          onCreateTag={onCreateTag}
          onSave={onSave}
          onDelete={onDelete}
          onClose={onClose}
        />
      )}
    </Dialog>
  )
}

function ItemForm({ item, restoring, barcode, categories, shops, tags, onCreateCategory, onCreateTag, onSave, onDelete, onClose }: Omit<ItemDialogProps, 'open'>) {
  const [values, setValues] = useState<ItemFormValues>({
    name: item?.name ?? '',
    brandNote: item?.brandNote ?? '',
    categoryId: item === undefined || (restoring && !isLiveReference(categories, item.categoryId)) ? '' : item.categoryId,
    necessity: item?.necessity ?? '',
    state: 'enough',
    shopId: restoring && !isLiveReference(shops, item?.shopId) ? NO_SHOP_OVERRIDE : (item?.shopId ?? NO_SHOP_OVERRIDE),
  })
  const [errors, setErrors] = useState<ItemFormErrors>({})
  /** Every Tag id the Item carries, including those of deleted Tags, which have no chip but come back with their Tag. */
  const [tagIds, setTagIds] = useState<catalogue.TagId[]>(item?.tagIds ?? [])
  const [tagName, setTagName] = useState('')
  const [tagError, setTagError] = useState<string | null>(null)
  const [removedBarcodes, setRemovedBarcodes] = useState<core.Barcode[]>([])
  const [saveError, setSaveError] = useState<string | null>(null)
  /** Why the prompt's last submit failed, and the prompt field it belongs to; `create` is a rejection from `onCreateCategory`. */
  const [categoryError, setCategoryError] = useState<{ field: keyof CategoryDraft | 'create'; message: string } | null>(null)
  /** The "+ New Category" prompt: `null` while it is closed. */
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft | null>(null)

  /** Sets a field, and drops its shown error once the new value is valid, without waiting for the next Save. */
  function set(field: Exclude<keyof ItemFormValues, 'state'>, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    if (!isErrorField(field)) return
    // Decided on the errors as they are when the update runs: a `set` after an await would otherwise read a stale `errors`.
    setErrors((current) => {
      if (!(field in current)) return current
      const result = parseItemFormValues({ ...values, [field]: value })
      if ('errors' in result && field in result.errors) return current
      const { [field]: _cleared, ...rest } = current
      return rest
    })
  }

  const keptBarcodes = (item?.barcodes ?? []).filter((barcode) => !removedBarcodes.includes(barcode))

  function handleCategoryChange(event: JSX.TargetedEvent<HTMLSelectElement>) {
    const { value } = event.currentTarget
    if (value === NEW_CATEGORY) {
      setCategoryDraft((current) => current ?? { name: '', shopId: '' })
    } else {
      set('categoryId', value)
      closeCategoryPrompt()
    }
  }

  /** Updates one field of the prompt's draft, and drops the shown error for that field once the field itself is valid, without waiting for the next Create Category. */
  function editCategoryDraft(field: keyof CategoryDraft, value: string) {
    const next = { name: '', shopId: '', ...categoryDraft, [field]: value }
    setCategoryDraft(next)
    // Decided on the error as it is when the update runs, like `set`: not on this render's copy.
    setCategoryError((current) => {
      if (current?.field !== field) return current
      const valid = field === 'name' ? next.name.trim() !== '' : shops.some((shop) => shop.id === next.shopId)
      return valid ? null : current
    })
  }

  function closeCategoryPrompt() {
    setCategoryDraft(null)
    setCategoryError(null)
  }

  /** Enter in the prompt's fields creates the Category instead of submitting the Item form around it. */
  function handleCategoryPromptKeyDown(event: JSX.TargetedKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Enter' || event.target instanceof HTMLButtonElement) return
    event.preventDefault()
    void handleCreateCategory()
  }

  async function handleCreateCategory() {
    if (categoryDraft === null) return
    const valid = validateCategoryDraft(categoryDraft, shops)
    if ('error' in valid) return setCategoryError({ field: valid.field, message: valid.error })
    setCategoryError(null)
    try {
      set('categoryId', await onCreateCategory(valid.name, valid.shopId))
      closeCategoryPrompt()
    } catch (err) {
      setCategoryError({ field: 'create', message: err instanceof Error ? err.message : 'Could not add Category' })
    }
  }

  /** Attaches the live Tag named `tagName`, ignoring case and surrounding spaces, creating it when there is none. */
  async function handleAddTag() {
    const name = tagName.trim()
    if (name === '') return
    setTagError(null)
    try {
      const id = findTagByName(tags, name)?.id ?? (await onCreateTag(name))
      setTagIds((current) => (current.includes(id) ? current : [...current, id]))
      setTagName('')
    } catch (err) {
      setTagError(err instanceof Error ? err.message : 'Could not add Tag')
    }
  }

  /** Enter in the Tags field attaches the Tag instead of submitting the Item form around it. */
  function handleTagKeyDown(event: JSX.TargetedKeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    void handleAddTag()
  }

  async function handleSubmit(event: JSX.TargetedEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = parseItemFormValues(values)
    if ('errors' in result) {
      setErrors(result.errors)
      return
    }
    setErrors({})
    setSaveError(null)
    try {
      const withTags = { ...result.input, tagIds }
      const input = removedBarcodes.length > 0 ? { ...withTags, removedBarcodes } : withTags
      await onSave(item ? input : { ...input, state: values.state })
      onClose()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save Item')
    }
  }

  function handleDelete() {
    if (!item || !onDelete) return
    onDelete(item)
    onClose()
  }

  const attachedTags = tags.filter((tag) => tagIds.includes(tag.id))

  return (
    <form class="item-form" onSubmit={handleSubmit}>
      {saveError !== null && <p role="alert">{saveError}</p>}
      <TextField label="Name" error={errors.name} value={values.name} onInput={(event) => set('name', event.currentTarget.value)} />
      <TextField
        label="Brand note"
        value={values.brandNote}
        onInput={(event) => set('brandNote', event.currentTarget.value)}
      />
      <Select label="Category" error={errors.categoryId} value={categoryDraft === null ? values.categoryId : NEW_CATEGORY} onChange={handleCategoryChange}>
        <option value="">Choose a Category</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
        <option value={NEW_CATEGORY}>+ New Category</option>
      </Select>
      {categoryDraft !== null && (
        <div class="item-form__group" onKeyDown={handleCategoryPromptKeyDown}>
          {categoryError?.field === 'create' && <p role="alert">{categoryError.message}</p>}
          <TextField
            label="New Category name"
            error={categoryError?.field === 'name' ? categoryError.message : undefined}
            value={categoryDraft.name}
            onInput={(event) => editCategoryDraft('name', event.currentTarget.value)}
          />
          {shops.length === 0 ? (
            <p>Add a Shop in Settings before adding a Category.</p>
          ) : (
            <Select
              label="Default Shop"
              error={categoryError?.field === 'shopId' ? categoryError.message : undefined}
              value={categoryDraft.shopId}
              onChange={(event) => editCategoryDraft('shopId', event.currentTarget.value)}
            >
              <option value="" disabled>
                Choose a Shop
              </option>
              {shops.map((shop) => (
                <option key={shop.id} value={shop.id}>
                  {shop.name}
                </option>
              ))}
            </Select>
          )}
          <DialogActions>
            <Button variant="text" onClick={closeCategoryPrompt}>
              Cancel new Category
            </Button>
            <Button onClick={handleCreateCategory}>Create Category</Button>
          </DialogActions>
        </div>
      )}
      <Select label="Necessity" error={errors.necessity} value={values.necessity} onChange={(event) => set('necessity', event.currentTarget.value)}>
        <option value="">Choose a Necessity</option>
        {catalogue.necessitySchema.options.map((necessity) => (
          <option key={necessity} value={necessity}>
            {necessity}
          </option>
        ))}
      </Select>
      {!item && (
        <Select
          label="State"
          value={values.state}
          onChange={(event) => setValues((current) => ({ ...current, state: core.stateSchema.parse(event.currentTarget.value) }))}
        >
          {core.stateSchema.options.map((state) => (
            <option key={state} value={state}>
              {state}
            </option>
          ))}
        </Select>
      )}
      <Select label="Shop override" value={values.shopId} onChange={(event) => set('shopId', event.currentTarget.value)}>
        <option value={NO_SHOP_OVERRIDE}>Use Category default</option>
        {shops.map((shop) => (
          <option key={shop.id} value={shop.id}>
            {shop.name}
          </option>
        ))}
      </Select>
      <TextField
        label="Tags"
        error={tagError ?? undefined}
        value={tagName}
        onInput={(event) => {
          setTagName(event.currentTarget.value)
          setTagError(null)
        }}
        onKeyDown={handleTagKeyDown}
      />
      <Button variant="text" onClick={handleAddTag}>
        Add Tag
      </Button>
      {attachedTags.length > 0 && (
        <div class="item-form__chips">
          {attachedTags.map((tag) => (
            <Chip
              key={tag.id}
              label={tag.name}
              dismissLabel={`Remove Tag ${tag.name}`}
              onDismiss={() => setTagIds((current) => current.filter((id) => id !== tag.id))}
            />
          ))}
        </div>
      )}
      {!item && barcode !== undefined && <TextField label="Barcode" readOnly value={barcode} />}
      {keptBarcodes.length > 0 && (
        <section aria-labelledby="item-barcodes-heading">
          <h3 id="item-barcodes-heading">Barcodes</h3>
          <ul>
            {keptBarcodes.map((barcode) => (
              <li key={barcode}>
                {barcode}
                <IconButton
                  symbol={CloseIcon}
                  label={`Remove barcode ${barcode}`}
                  onClick={() => setRemovedBarcodes((current) => [...current, barcode])}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
      <DialogActions
        destructive={
          item && onDelete ? (
            <Button variant="text" onClick={handleDelete}>
              Delete
            </Button>
          ) : undefined
        }
      >
        <Button variant="text" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit">Save</Button>
      </DialogActions>
    </form>
  )
}
