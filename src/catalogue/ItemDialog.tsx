import { useState } from 'preact/hooks'
import type { JSX } from 'preact'
import { catalogue } from 'data-platform'
import type { ItemInput, ItemRecord } from './items.ts'
import type { CategoryRecord } from './categories.ts'
import type { ShopRecord } from './shops.ts'
import { Button } from '../ui/Button.tsx'
import { Dialog } from '../ui/Dialog.tsx'
import { Select } from '../ui/Select.tsx'
import { TextField } from '../ui/TextField.tsx'

export interface ItemDialogProps {
  open: boolean
  /** The Item being edited; without one the dialog adds an Item. */
  item?: ItemRecord
  categories: CategoryRecord[]
  shops: ShopRecord[]
  /** Called with the validated fields when the Member saves; a rejection is shown in the dialog and keeps it open. */
  onSave: (input: ItemInput) => Promise<void>
  onClose: () => void
}

const NO_SHOP_OVERRIDE = ''

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
  if (trimmedName.length === 0 || !catalogue.isCategoryId(values.categoryId) || !necessity.success) {
    return {
      errors: {
        ...(trimmedName.length === 0 ? { name: 'An Item needs a name.' } : {}),
        ...(catalogue.isCategoryId(values.categoryId) ? {} : { categoryId: 'Choose a Category.' }),
        ...(necessity.success ? {} : { necessity: 'Choose a Necessity.' }),
      },
    }
  }
  const trimmedBrandNote = values.brandNote.trim()
  return {
    input: {
      name: trimmedName,
      brandNote: trimmedBrandNote.length === 0 ? undefined : trimmedBrandNote,
      categoryId: values.categoryId,
      necessity: necessity.data,
      shopId: catalogue.isShopId(values.shopId) ? values.shopId : undefined,
    },
  }
}

/** The form for an Item's name, brand note, Category, Necessity and Shop override, in a dialog that starts from `item`, or empty, on each open. */
export function ItemDialog({ open, item, categories, shops, onSave, onClose }: ItemDialogProps) {
  return (
    <Dialog open={open} title={item ? 'Edit Item' : 'Add Item'} onClose={onClose}>
      {open && <ItemForm item={item} categories={categories} shops={shops} onSave={onSave} onClose={onClose} />}
    </Dialog>
  )
}

function ItemForm({ item, categories, shops, onSave, onClose }: Omit<ItemDialogProps, 'open'>) {
  const [values, setValues] = useState<ItemFormValues>({
    name: item?.name ?? '',
    brandNote: item?.brandNote ?? '',
    categoryId: item?.categoryId ?? '',
    necessity: item?.necessity ?? '',
    shopId: item?.shopId ?? NO_SHOP_OVERRIDE,
  })
  const [errors, setErrors] = useState<ItemFormErrors>({})
  const [saveError, setSaveError] = useState<string | null>(null)

  function set(field: keyof ItemFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
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
      await onSave(result.input)
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
      <Select label="Category" error={errors.categoryId} value={values.categoryId} onChange={(event) => set('categoryId', event.currentTarget.value)}>
        <option value="">Choose a Category</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </Select>
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
      <Button variant="text" onClick={onClose}>
        Cancel
      </Button>
      <Button type="submit">Save</Button>
    </form>
  )
}
