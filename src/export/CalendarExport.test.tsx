import { act, fireEvent, render, screen } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { catalogue, core } from 'data-platform'
import { CalendarExport } from './CalendarExport.tsx'
import { TopAppBar } from '../shell/TopAppBar.tsx'
import type { ItemRecord } from '../catalogue/items.ts'
import type { CategoryRecord } from '../catalogue/categories.ts'
import type { ShopRecord } from '../catalogue/shops.ts'

const exportShoppingList = vi.fn()
vi.mock('./exportShoppingList.ts', () => ({
  exportShoppingList: (groups: unknown, date: unknown) => exportShoppingList(groups, date),
}))

const pharmacy: ShopRecord = { id: catalogue.shopId('pharmacy'), name: 'Pharmacy', referenceCount: 1 }
const medicine: CategoryRecord = {
  id: catalogue.categoryId('medicine'),
  name: 'Medicine',
  defaultShopId: pharmacy.id,
  referenceCount: 1,
}
const bandages: ItemRecord = {
  id: core.itemId('bandages'),
  name: 'Bandages',
  state: 'out',
  categoryId: medicine.id,
  necessity: 'essential',
}

/** jsdom has no modal dialog; stand in for the browser's open/close bookkeeping. */
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  })
  exportShoppingList.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

function renderWith(items: ItemRecord[], categories: CategoryRecord[], shops: ShopRecord[]) {
  render(
    <TopAppBar title="Shopping list">
      <CalendarExport items={items} categories={categories} shops={shops} />
    </TopAppBar>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Export to Calendar' }))
}

async function submit(dateValue: string) {
  fireEvent.input(screen.getByLabelText('Date'), { target: { value: dateValue } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Export' }))
  })
}

describe('CalendarExport', () => {
  it('rejects submitting with no date chosen', async () => {
    renderWith([bandages], [medicine], [pharmacy])

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Export' }))
    })

    expect(screen.getByRole('alert')).toHaveTextContent('Choose a date to export to.')
    expect(exportShoppingList).not.toHaveBeenCalled()
  })

  it('rejects exporting when there are no pending Items', async () => {
    renderWith([], [medicine], [pharmacy])

    await submit('2026-03-05')

    expect(screen.getByRole('alert')).toHaveTextContent('No pending Items to export.')
    expect(exportShoppingList).not.toHaveBeenCalled()
  })

  it('rejects exporting while offline, without attempting the export', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    renderWith([bandages], [medicine], [pharmacy])

    await submit('2026-03-05')

    expect(screen.getByRole('alert')).toHaveTextContent('Exporting to Calendar needs a connection.')
    expect(exportShoppingList).not.toHaveBeenCalled()
  })

  it('exports the pending Items grouped by Shop, on the chosen date', async () => {
    exportShoppingList.mockResolvedValueOnce({ status: 'exported' })
    renderWith([bandages], [medicine], [pharmacy])

    await submit('2026-03-05')

    expect(exportShoppingList).toHaveBeenCalledWith([{ shop: pharmacy, items: [bandages] }], '2026-03-05')
    expect(screen.getByRole('status')).toHaveTextContent('Exported to Calendar.')
  })

  it('notes pending Items with no resolved Shop are left out of the export', () => {
    const orphan: ItemRecord = {
      id: core.itemId('orphan'),
      name: 'Mystery item',
      state: 'out',
      categoryId: catalogue.categoryId('deleted-category'),
      necessity: 'important',
    }
    renderWith([bandages, orphan], [medicine], [pharmacy])

    expect(screen.getByText("1 pending Item with no Shop won't be included in the export.")).toBeInTheDocument()
  })

  it('shows a deep link per Shop when the export falls back', async () => {
    exportShoppingList.mockResolvedValueOnce({
      status: 'fallback',
      links: [{ shopName: 'Pharmacy', url: 'https://calendar.google.com/calendar/render?text=Pharmacy' }],
    })
    renderWith([bandages], [medicine], [pharmacy])

    await submit('2026-03-05')

    const link = screen.getByRole('link', { name: 'Pharmacy' })
    expect(link).toHaveAttribute('href', 'https://calendar.google.com/calendar/render?text=Pharmacy')
  })
})
