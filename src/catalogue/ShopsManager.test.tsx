import { fireEvent, render, screen, waitFor } from '@testing-library/preact'
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
  // jsdom has no modal dialog; stand in for the browser's open/close bookkeeping.
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  })
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

function openEditor(shopName: string) {
  fireEvent.click(screen.getByRole('button', { name: `Edit ${shopName}` }))
}

describe('ShopsManager', () => {
  it('has a back arrow in the top app bar’s leading slot that returns to Settings', () => {
    watchShops.mockReturnValue(unsubscribe)
    window.location.hash = '#/settings/shops'
    render(
      <TopAppBar title="Shops">
        <ShopsManager db={fakeDb} />
      </TopAppBar>,
    )

    const back = screen.getByRole('button', { name: 'Back to Settings' })
    expect(back.closest('.shell-top-bar__navigation')).not.toBeNull()
    fireEvent.click(back)

    expect(window.location.hash).toBe('#/settings')
  })

  it('lists every Shop from watchShops', () => {
    renderWithShops([pharmacy, grocery])

    expect(screen.getByText('Pharmacy')).toBeInTheDocument()
    expect(screen.getByText('Grocery')).toBeInTheDocument()
  })

  it('adds a Shop through the FAB dialog and closes it', async () => {
    renderWithShops([])
    fireEvent.click(screen.getByRole('button', { name: 'Add Shop' }))

    fireEvent.input(screen.getByLabelText('New Shop name'), { target: { value: 'Hardware' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(createShop).toHaveBeenCalledWith(fakeDb, 'Hardware')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('shows a message and keeps the input when adding fails', async () => {
    createShop.mockRejectedValueOnce(new Error('Could not add Shop'))
    renderWithShops([])
    fireEvent.click(screen.getByRole('button', { name: 'Add Shop' }))

    fireEvent.input(screen.getByLabelText('New Shop name'), { target: { value: 'Hardware' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not add Shop')
    expect(screen.getByLabelText('New Shop name')).toHaveValue('Hardware')
  })

  it('refuses to add a Shop with a blank name, without calling createShop', () => {
    renderWithShops([])
    fireEvent.click(screen.getByRole('button', { name: 'Add Shop' }))

    fireEvent.input(screen.getByLabelText('New Shop name'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(screen.getByRole('alert')).toHaveTextContent('A Shop needs a name.')
    expect(createShop).not.toHaveBeenCalled()
  })

  it('refuses to rename a Shop to a blank name, without calling renameShop', () => {
    renderWithShops([pharmacy])
    openEditor('Pharmacy')
    fireEvent.input(screen.getByLabelText('Shop name'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))

    expect(screen.getByRole('alert')).toHaveTextContent('A Shop needs a name.')
    expect(renameShop).not.toHaveBeenCalled()
  })

  it('renames a Shop', async () => {
    renderWithShops([pharmacy])
    openEditor('Pharmacy')

    fireEvent.input(screen.getByLabelText('Shop name'), { target: { value: 'Pharmacy & Health' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))

    expect(renameShop).toHaveBeenCalledWith(fakeDb, pharmacy, 'Pharmacy & Health')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('deletes a Shop', async () => {
    renderWithShops([pharmacy])
    openEditor('Pharmacy')

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(deleteShop).toHaveBeenCalledWith(fakeDb, pharmacy)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('shows the ShopInUseError message when deletion is refused', async () => {
    deleteShop.mockRejectedValueOnce(new FakeShopInUseError('This Shop is in use.'))
    renderWithShops([pharmacy])
    openEditor('Pharmacy')

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('This Shop is in use.')
  })

  it('opens the Edit Shop dialog when the row itself is tapped', () => {
    renderWithShops([pharmacy])

    fireEvent.click(screen.getByText('Pharmacy'))

    expect(screen.getByRole('dialog', { name: 'Edit Shop' })).toBeInTheDocument()
  })

  it('starts each Add Shop opening blank, with no leftover error', () => {
    renderWithShops([])
    fireEvent.click(screen.getByRole('button', { name: 'Add Shop' }))
    fireEvent.input(screen.getByLabelText('New Shop name'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByRole('alert')).toBeInTheDocument()
    fireEvent.input(screen.getByLabelText('New Shop name'), { target: { value: 'Hard' } })

    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Add Shop' }))

    expect(screen.getByLabelText('New Shop name')).toHaveValue('')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('clears a delete refusal when another Shop is opened', async () => {
    deleteShop.mockRejectedValueOnce(new FakeShopInUseError('This Shop is in use.'))
    renderWithShops([pharmacy, grocery])
    openEditor('Pharmacy')
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await screen.findByRole('alert')

    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    openEditor('Grocery')

    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByLabelText('Shop name')).toHaveValue('Grocery')
  })

  it('unsubscribes from the Shops list on unmount', () => {
    const { unmount } = renderWithShops([])
    unmount()

    expect(unsubscribe).toHaveBeenCalled()
  })
})
