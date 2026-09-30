import { useState } from 'preact/hooks'
import type { JSX } from 'preact'
import { catalogue, type core } from 'data-platform'
import type { ItemEdit, ItemInput, ItemRecord } from './items.ts'
import type { CategoryRecord } from './categories.ts'
import type { ShopRecord } from './shops.ts'
import { Button } from '../ui/Button.tsx'
import { IconButton } from '../ui/IconButton.tsx'
import { Dialog } from '../ui/Dialog.tsx'
import { Select } from '../ui/Select.tsx'
import { TextField } from '../ui/TextField.tsx'
import CloseIcon from '~icons/material-symbols/close'

export interface ItemDialogProps {
  open: boolean
  /** The Item being edited; without one the dialog adds an Item. */
  item?: ItemRecord
  categories: CategoryRecord[]
  shops: ShopRecord[]
  /** Creates a Category and resolves with its id; a rejection is shown in the dialog's Category prompt. */
  onCreateCategory: (name: string, defaultShopId: catalogue.ShopId) => Promise<catalogue.CategoryId>
  /**
   * Called with the validated fields, and the Item's Barcodes the Member removed, when they save; a rejection
   * is shown in the dialog and keeps it open.
   */
  onSave: (input: ItemEdit) => Promise<void>
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
}

type ItemFormErrors = Partial<Record<'name' | 'categoryId' | 'necessity', string>>

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

/** The form for an Item's name, brand note, Category, Necessity and Shop override, plus its Barcodes when editing, in a dialog that starts from `item`, or empty, on each open. */
export function ItemDialog({ open, item, categories, shops, onCreateCategory, onSave, onClose }: ItemDialogProps) {
  return (
    <Dialog open={open} title={item ? 'Edit Item' : 'Add Item'} onClose={onClose}>
      {open && (
        <ItemForm
          item={item}
          categories={categories}
          shops={shops}
          onCreateCategory={onCreateCategory}
          onSave={onSave}
          onClose={onClose}
        />
      )}
    </Dialog>
  )
}

function ItemForm({ item, categories, shops, onCreateCategory, onSave, onClose }: Omit<ItemDialogProps, 'open'>) {
  const [values, setValues] = useState<ItemFormValues>({
    name: item?.name ?? '',
    brandNote: item?.brandNote ?? '',
    categoryId: item?.categoryId ?? '',
    necessity: item?.necessity ?? '',
    shopId: item?.shopId ?? NO_SHOP_OVERRIDE,
  })
  const [errors, setErrors] = useState<ItemFormErrors>({})
  const [removedBarcodes, setRemovedBarcodes] = useState<core.Barcode[]>([])
  const [saveError, setSaveError] = useState<string | null>(null)
  const [categoryError, setCategoryError] = useState<string | null>(null)
  /** The "+ New Category" prompt: `null` while it is closed. */
  const [categoryDraft, setCategoryDraft] = useState<{ name: string; shopId: string } | null>(null)

  function set(field: keyof ItemFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
  }

  const keptBarcodes = (item?.barcodes ?? []).filter((barcode) => !removedBarcodes.includes(barcode))

  function handleCategoryChange(event: JSX.TargetedEvent<HTMLSelectElement>) {
    const { value } = event.currentTarget
    if (value === NEW_CATEGORY) setCategoryDraft({ name: '', shopId: '' })
    else set('categoryId', value)
  }

  async function handleCreateCategory() {
    if (categoryDraft === null) return
    const name = categoryDraft.name.trim()
    const shop = shops.find((candidate) => candidate.id === categoryDraft.shopId)
    if (name.length === 0) return setCategoryError('A Category needs a name.')
    if (shop === undefined || !catalogue.isShopId(shop.id)) return setCategoryError('Choose a default Shop.')
    setCategoryError(null)
    try {
      set('categoryId', await onCreateCategory(name, shop.id))
      setCategoryDraft(null)
    } catch (err) {
      setCategoryError(err instanceof Error ? err.message : 'Could not add Category')
    }
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
      await onSave(removedBarcodes.length > 0 ? { ...result.input, removedBarcodes } : result.input)
      onClose()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save Item')
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {saveError !== null && <p role="alert">{saveError}</p>}
      <TextField label="Name" error={errors.name} value={values.name} onInput={(event) => set('name', event.currentTarget.value)} />
      <TextField
        label="Brand note"
        value={values.brandNote}
        onInput={(event) => set('brandNote', event.currentTarget.value)}
      />
      <Select label="Category" error={errors.categoryId} value={values.categoryId} onChange={handleCategoryChange}>
        <option value="">Choose a Category</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
        <option value={NEW_CATEGORY}>+ New Category</option>
      </Select>
      {categoryDraft !== null && (
        <>
          {categoryError !== null && <p role="alert">{categoryError}</p>}
          <TextField
            label="New Category name"
            value={categoryDraft.name}
            onInput={(event) => setCategoryDraft({ ...categoryDraft, name: event.currentTarget.value })}
          />
          <Select
            label="Default Shop"
            value={categoryDraft.shopId}
            onChange={(event) => setCategoryDraft({ ...categoryDraft, shopId: event.currentTarget.value })}
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
          <Button onClick={handleCreateCategory}>Create Category</Button>
        </>
      )}
      <Select label="Necessity" error={errors.necessity} value={values.necessity} onChange={(event) => set('necessity', event.currentTarget.value)}>
        <option value="">Choose a Necessity</option>
        {catalogue.necessitySchema.options.map((necessity) => (
          <option key={necessity} value={necessity}>
            {necessity}
          </option>
        ))}
      </Select>
      <Select label="Shop override" value={values.shopId} onChange={(event) => set('shopId', event.currentTarget.value)}>
        <option value={NO_SHOP_OVERRIDE}>Use Category default</option>
        {shops.map((shop) => (
          <option key={shop.id} value={shop.id}>
            {shop.name}
          </option>
        ))}
      </Select>
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
      <Button variant="text" onClick={onClose}>
        Cancel
      </Button>
      <Button type="submit">Save</Button>
    </form>
  )
}
