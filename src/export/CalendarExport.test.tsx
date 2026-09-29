import { act, fireEvent, render, screen } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { catalogue, core } from 'data-platform'
import { CalendarExport } from './CalendarExport.tsx'
import type { ItemRecord } from '../catalogue/items.ts'
import type { CategoryRecord } from '../catalogue/categories.ts'
import type { ShopRecord } from '../catalogue/shops.ts'

const watchItems = vi.fn()
vi.mock('../catalogue/items.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../catalogue/items.ts')>()),
  watchItems: (db: unknown, cb: unknown) => watchItems(db, cb),
}))

const watchCategories = vi.fn()
vi.mock('../catalogue/categories.ts', () => ({
  watchCategories: (db: unknown, cb: unknown) => watchCategories(db, cb),
}))

const watchShops = vi.fn()
vi.mock('../catalogue/shops.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../catalogue/shops.ts')>()),
  watchShops: (db: unknown, cb: unknown) => watchShops(db, cb),
}))

const exportShoppingList = vi.fn()
vi.mock('./exportShoppingList.ts', () => ({
  exportShoppingList: (groups: unknown, date: unknown) => exportShoppingList(groups, date),
}))

const fakeDb = { name: 'fake-db' } as unknown as Firestore

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

beforeEach(() => {
  watchItems.mockReset()
  watchCategories.mockReset()
  watchShops.mockReset()
  exportShoppingList.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

function renderWith(items: ItemRecord[], categories: CategoryRecord[], shops: ShopRecord[]) {
  watchItems.mockImplementation((_db: unknown, cb: (items: ItemRecord[]) => void) => {
    cb(items)
    return vi.fn()
  })
  watchCategories.mockImplementation((_db: unknown, cb: (categories: CategoryRecord[]) => void) => {
    cb(categories)
    return vi.fn()
  })
  watchShops.mockImplementation((_db: unknown, cb: (shops: ShopRecord[]) => void) => {
    cb(shops)
    return vi.fn()
  })
  return render(<CalendarExport db={fakeDb} />)
}

async function submit(dateValue: string) {
  fireEvent.input(screen.getByLabelText('Date'), { target: { value: dateValue } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Export to Calendar' }))
  })
}

describe('CalendarExport', () => {
  it('rejects submitting with no date chosen', async () => {
    renderWith([bandages], [medicine], [pharmacy])

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Export to Calendar' }))
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
