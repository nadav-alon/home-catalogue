import { catalogue, core } from 'data-platform'
import type { CategoryRecord } from './categories.ts'
import type { ItemRecord } from './items.ts'
import type { ShopRecord } from './shops.ts'

/**
 * Shared Shop and Category records for tests. Every `referenceCount` is 0; a test that needs
 * a referenced record spreads over it: `{ ...grocery, referenceCount: 1 }`.
 */
export const pharmacy: ShopRecord = { id: catalogue.shopId('pharmacy'), name: 'Pharmacy', referenceCount: 0 }
export const grocery: ShopRecord = { id: catalogue.shopId('grocery'), name: 'Grocery', referenceCount: 0 }
export const medicine: CategoryRecord = {
  id: catalogue.categoryId('medicine'),
  name: 'Medicine',
  defaultShopId: pharmacy.id,
  referenceCount: 0,
}
export const cleaning: CategoryRecord = {
  id: catalogue.categoryId('cleaning'),
  name: 'Cleaning',
  defaultShopId: grocery.id,
  referenceCount: 0,
}

/** A shared Item record for tests; a test that needs a variation spreads over it: `{ ...bandages, brandNote }`. */
export const bandages: ItemRecord = {
  id: core.itemId('bandages'),
  name: 'Bandages',
  state: 'enough',
  categoryId: medicine.id,
  necessity: 'essential',
}

/** {@link bandages} carrying two Barcodes, for tests of the Item dialog's Barcodes list. */
export const bandagesWithBarcodes: ItemRecord = {
  ...bandages,
  barcodes: [core.barcode('12345678'), core.barcode('1234567890123')],
}
