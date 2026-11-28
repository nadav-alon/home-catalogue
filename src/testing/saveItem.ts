import { fireEvent, screen, within } from '@testing-library/preact'
import type { Mock } from 'vitest'
import type { core } from 'data-platform'
import { choose } from './select.ts'

/** Test-only: fills the required fields of the open Add Item dialog and saves it, `createItem` resolving to `id`. */
export function saveNewItem(createItem: Mock, id: core.ItemId, categoryId: string): void {
  createItem.mockResolvedValue(id)
  choose(within(screen.getByRole('dialog')).getByLabelText('Category'), categoryId)
  choose(screen.getByLabelText('Necessity'), 'essential')
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
}
