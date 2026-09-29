import { catalogue } from 'data-platform'
import type { CategoryRecord } from './categories.ts'
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
