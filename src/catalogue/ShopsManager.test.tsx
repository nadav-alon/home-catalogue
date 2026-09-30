import { fireEvent, render, screen } from '@testing-library/preact'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { TopAppBar } from '../shell/TopAppBar.tsx'
import { ShopsManager } from './ShopsManager.tsx'
import type { ShopRecord } from './shops.ts'
import { grocery, pharmacy } from './testFixtures.ts'

const createShop = vi.fn()
const renameShop = vi.fn()
const deleteShop = vi.fn()
const watchShops = vi.fn()

const { FakeShopInUseError } = vi.hoisted(() => ({
  FakeShopInUseError: class extends Error {},
}))

vi.mock('./shops.ts', () => ({
  createShop: (db: unknown, name: string) => createShop(db, name),
  renameShop: (db: unknown, shop: unknown, name: string) => renameShop(db, shop, name),
  deleteShop: (db: unknown, shop: unknown) => deleteShop(db, shop),
  watchShops: (db: unknown, cb: unknown) => watchShops(db, cb),
  ShopInUseError: FakeShopInUseError,
}))

const fakeDb = { name: 'fake-db' } as unknown as Firestore
const unsubscribe = vi.fn()

beforeEach(() => {
  createShop.mockReset().mockResolvedValue(undefined)
  renameShop.mockReset().mockResolvedValue(undefined)
  deleteShop.mockReset().mockResolvedValue(undefined)
  watchShops.mockReset()
  unsubscribe.mockClear()
})

function renderWithShops(shops: ShopRecord[]) {
  watchShops.mockImplementation((_db: unknown, cb: (shops: ShopRecord[]) => void) => {
    cb(shops)
    return unsubscribe
  })
  return render(<ShopsManager db={fakeDb} />)
}

describe('ShopsManager', () => {
  it('has a back arrow in the top app bar that returns to Settings', () => {
    watchShops.mockReturnValue(unsubscribe)
    window.location.hash = '#/settings/shops'
    render(
      <TopAppBar title="Shops">
        <ShopsManager db={fakeDb} />
      </TopAppBar>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Back to Settings' }))

    expect(window.location.hash).toBe('#/settings')
  })

  it('lists every Shop from watchShops', () => {
    renderWithShops([pharmacy, grocery])

    expect(screen.getByText('Delete Pharmacy')).toBeInTheDocument()
    expect(screen.getByText('Delete Grocery')).toBeInTheDocument()
  })

  it('adds a new Shop and clears the input', async () => {
    renderWithShops([])

    fireEvent.input(screen.getByLabelText('New Shop name'), { target: { value: 'Hardware' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Shop' }))

    expect(createShop).toHaveBeenCalledWith(fakeDb, 'Hardware')
    await screen.findByLabelText('New Shop name')
    expect(screen.getByLabelText('New Shop name')).toHaveValue('')
  })

  it('shows a message and keeps the input when adding fails', async () => {
    createShop.mockRejectedValueOnce(new Error('Could not add Shop'))
    renderWithShops([])

    fireEvent.input(screen.getByLabelText('New Shop name'), { target: { value: 'Hardware' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Shop' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not add Shop')
    expect(screen.getByLabelText('New Shop name')).toHaveValue('Hardware')
  })

  it('refuses to add a Shop with a blank name, without calling createShop', () => {
    renderWithShops([])

    fireEvent.input(screen.getByLabelText('New Shop name'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Shop' }))

    expect(screen.getByRole('alert')).toHaveTextContent('A Shop needs a name.')
    expect(createShop).not.toHaveBeenCalled()
  })

  it('refuses to rename a Shop to a blank name, without calling renameShop', () => {
    renderWithShops([pharmacy])

    fireEvent.input(screen.getByLabelText('Rename Pharmacy'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))

    expect(screen.getByRole('alert')).toHaveTextContent('A Shop needs a name.')
    expect(renameShop).not.toHaveBeenCalled()
  })

  it('renames a Shop', async () => {
    renderWithShops([pharmacy])

    fireEvent.input(screen.getByLabelText('Rename Pharmacy'), { target: { value: 'Pharmacy & Health' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))

    expect(renameShop).toHaveBeenCalledWith(fakeDb, pharmacy, 'Pharmacy & Health')
  })

  it('deletes a Shop', async () => {
    renderWithShops([pharmacy])

    fireEvent.click(screen.getByRole('button', { name: 'Delete Pharmacy' }))

    expect(deleteShop).toHaveBeenCalledWith(fakeDb, pharmacy)
  })

  it('shows the ShopInUseError message when deletion is refused', async () => {
    deleteShop.mockRejectedValueOnce(new FakeShopInUseError('This Shop is in use.'))
    renderWithShops([pharmacy])

    fireEvent.click(screen.getByRole('button', { name: 'Delete Pharmacy' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('This Shop is in use.')
  })

  it('unsubscribes from the Shops list on unmount', () => {
    const { unmount } = renderWithShops([])
    unmount()

    expect(unsubscribe).toHaveBeenCalled()
  })
})
