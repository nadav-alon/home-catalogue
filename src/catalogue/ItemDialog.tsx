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

function parseItemFormValues(values: ItemFormValues): { input: ItemInput } | { error: string } {
  const trimmedName = values.name.trim()
  if (trimmedName.length === 0) {
    return { error: 'An Item needs a name.' }
  }
  if (!catalogue.isCategoryId(values.categoryId)) {
    return { error: 'Choose a Category.' }
  }
  const necessity = catalogue.necessitySchema.safeParse(values.necessity)
  if (!necessity.success) {
    return { error: 'Choose a Necessity.' }
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
  const [error, setError] = useState<string | null>(null)

  function set(field: keyof ItemFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event: JSX.TargetedEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = parseItemFormValues(values)
    if ('error' in result) {
      setError(result.error)
      return
    }
    try {
      await onSave(result.input)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save Item')
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error !== null && <p role="alert">{error}</p>}
      <TextField label="Name" value={values.name} onInput={(event) => set('name', event.currentTarget.value)} />
      <TextField
        label="Brand note"
        value={values.brandNote}
        onInput={(event) => set('brandNote', event.currentTarget.value)}
      />
      <Select label="Category" value={values.categoryId} onChange={(event) => set('categoryId', event.currentTarget.value)}>
        <option value="">Choose a Category</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </Select>
      <Select label="Necessity" value={values.necessity} onChange={(event) => set('necessity', event.currentTarget.value)}>
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
