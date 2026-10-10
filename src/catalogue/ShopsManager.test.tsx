import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { catalogue } from 'data-platform'
import { TopAppBar } from '../shell/TopAppBar.tsx'
import { actionLabels } from '../testing/dialog.ts'
import { resetSnackbar, SnackbarHost } from '../ui/Snackbar.tsx'
import { ShopsManager, SHOP_DELETED_MESSAGE } from './ShopsManager.tsx'
import { SHOP_IN_USE_MESSAGE, type ShopRecord } from './shops.ts'
import { grocery, pharmacy } from './testFixtures.ts'
import { stubModalDialog } from '../testing/dialog.ts'

const createShop = vi.fn()
const renameShop = vi.fn()
const deleteShop = vi.fn()
const restoreShop = vi.fn()
const watchShops = vi.fn()

vi.mock('./shops.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./shops.ts')>()),
  createShop: (db: unknown, name: string) => createShop(db, name),
  renameShop: (db: unknown, shop: unknown, name: string) => renameShop(db, shop, name),
  deleteShop: (db: unknown, shop: unknown) => deleteShop(db, shop),
  restoreShop: (db: unknown, shop: unknown) => restoreShop(db, shop),
  watchShops: (db: unknown, cb: unknown) => watchShops(db, cb),
}))

const fakeDb = { name: 'fake-db' } as unknown as Firestore
const unsubscribe = vi.fn()

// Closing over unsaved edits asks; tests agree to discard unless they refuse.
let confirmSpy: MockInstance<typeof window.confirm>

afterEach(() => {
  cleanup()
  confirmSpy.mockRestore()
})

beforeEach(() => {
  confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
  stubModalDialog()
  createShop.mockReset().mockResolvedValue(catalogue.shopId('new-shop'))
  renameShop.mockReset().mockResolvedValue(undefined)
  deleteShop.mockReset().mockResolvedValue(undefined)
  restoreShop.mockReset().mockResolvedValue(undefined)
  resetSnackbar()
  watchShops.mockReset()
  unsubscribe.mockClear()
})

function renderWithShops(shops: ShopRecord[], { withSnackbar = false } = {}) {
  watchShops.mockImplementation((_db: unknown, cb: (shops: ShopRecord[]) => void) => {
    cb(shops)
    return unsubscribe
  })
  return render(
    <>
      <TopAppBar title="Shops">
        <ShopsManager db={fakeDb} />
      </TopAppBar>
      {withSnackbar && <SnackbarHost />}
    </>,
  )
}

/** Like renderWithShops, but `push` delivers a later watchShops update. */
function renderLive(shops: ShopRecord[], options: Parameters<typeof renderWithShops>[1] = {}) {
  const utils = renderWithShops(shops, options)
  const callback = watchShops.mock.calls[0][1] as (shops: ShopRecord[]) => void
  return { ...utils, push: callback }
}

function openEditor(shopName: string) {
  fireEvent.click(screen.getByRole('button', { name: `Edit ${shopName}` }))
}

describe('ShopsManager', () => {
  it('leaves the title to the top app bar, with no heading of its own', () => {
    renderWithShops([])

    const headings = screen.getAllByRole('heading', { name: 'Shops' })
    expect(headings).toHaveLength(1)
    expect(screen.getByRole('banner')).toContainElement(headings[0])
  })

  it('has a back arrow in the top app bar’s leading slot that returns to Settings', () => {
    window.location.hash = '#/settings/shops'
    renderWithShops([])

    const banner = screen.getByRole('banner')
    const back = within(banner).getByRole('button', { name: 'Back to Settings' })
    const heading = within(banner).getByRole('heading', { level: 1 })
    expect(back.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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

  it('cancels Add Shop without creating a Shop', async () => {
    renderWithShops([])
    fireEvent.click(screen.getByRole('button', { name: 'Add Shop' }))

    fireEvent.input(screen.getByLabelText('New Shop name'), { target: { value: 'Hardware' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(createShop).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('closes Add Shop from the title-row Close icon without creating a Shop', async () => {
    renderWithShops([])
    fireEvent.click(screen.getByRole('button', { name: 'Add Shop' }))

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(createShop).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('orders the Add Shop actions Cancel, Add', () => {
    renderWithShops([])
    fireEvent.click(screen.getByRole('button', { name: 'Add Shop' }))

    const labels = actionLabels(screen.getByRole('dialog'))
    expect(labels).toEqual(['Cancel', 'Add'])
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

  it('cancels Edit Shop without renaming or deleting the Shop', async () => {
    renderWithShops([pharmacy])
    openEditor('Pharmacy')

    fireEvent.input(screen.getByLabelText('Shop name'), { target: { value: 'Changed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(renameShop).not.toHaveBeenCalled()
    expect(deleteShop).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('closes Edit Shop from the title-row Close icon without renaming or deleting the Shop', async () => {
    renderWithShops([pharmacy])
    openEditor('Pharmacy')

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(renameShop).not.toHaveBeenCalled()
    expect(deleteShop).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('orders the Edit Shop actions Delete, Cancel, Rename', () => {
    renderWithShops([pharmacy])
    openEditor('Pharmacy')

    const labels = actionLabels(screen.getByRole('dialog'))
    expect(labels).toEqual(['Delete', 'Cancel', 'Rename'])
  })

  it('sets Delete apart from Cancel and Rename in the Edit Shop dialog', () => {
    renderWithShops([pharmacy])
    openEditor('Pharmacy')

    const dialog = screen.getByRole('dialog')
    const del = within(dialog).getByRole('button', { name: 'Delete' })
    expect(del.parentElement).toHaveClass('ui-dialog-actions__destructive')
    expect(within(dialog).getByRole('button', { name: 'Rename' }).closest('.ui-dialog-actions')).toBe(
      del.closest('.ui-dialog-actions'),
    )
  })

  it('lays out the Add Shop actions in the shared action row', () => {
    renderWithShops([])
    fireEvent.click(screen.getByRole('button', { name: 'Add Shop' }))

    expect(screen.getByRole('button', { name: 'Add' }).closest('.ui-dialog-actions')).not.toBeNull()
  })

  it('deletes a Shop', async () => {
    renderWithShops([pharmacy])
    openEditor('Pharmacy')

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(deleteShop).toHaveBeenCalledWith(fakeDb, pharmacy)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('offers Undo in a snackbar after deleting, which restores the Shop', async () => {
    renderWithShops([pharmacy], { withSnackbar: true })
    openEditor('Pharmacy')

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    const status = screen.getByRole('status')
    await waitFor(() => expect(status).toHaveTextContent('Deleted Pharmacy'))
    fireEvent.click(within(status).getByRole('button', { name: 'Undo' }))
    expect(restoreShop).toHaveBeenCalledWith(fakeDb, pharmacy)
  })

  it('shows no snackbar when deletion fails', async () => {
    deleteShop.mockRejectedValueOnce(new Error('boom'))
    renderWithShops([pharmacy], { withSnackbar: true })
    openEditor('Pharmacy')

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await screen.findByRole('alert')
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('shows a failure message when deletion fails', async () => {
    deleteShop.mockRejectedValueOnce(new Error('boom'))
    renderWithShops([pharmacy])
    openEditor('Pharmacy')

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not delete Shop')
  })

  it('disables Delete for an in-use Shop and says why before any press', () => {
    renderWithShops([{ ...pharmacy, referenceCount: 2 }])
    openEditor('Pharmacy')

    const deleteButton = screen.getByRole('button', { name: 'Delete' })
    expect(deleteButton).toBeDisabled()
    expect(deleteButton).toHaveAccessibleDescription(SHOP_IN_USE_MESSAGE)
    expect(screen.getByText(SHOP_IN_USE_MESSAGE)).toBeVisible()
  })

  it('keeps Delete enabled, with no in-use note, for an unused Shop', () => {
    renderWithShops([pharmacy])
    openEditor('Pharmacy')

    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Delete' })).not.toHaveAccessibleDescription()
  })

  it('disables Delete and shows the in-use note when the open Shop becomes in use', () => {
    const { push } = renderLive([pharmacy])
    openEditor('Pharmacy')
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled()

    act(() => push([{ ...pharmacy, referenceCount: 1 }]))

    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
    expect(screen.getByText(SHOP_IN_USE_MESSAGE)).toBeVisible()
  })

  it('enables Delete and removes the in-use note when the open Shop is freed', () => {
    const { push } = renderLive([{ ...pharmacy, referenceCount: 1 }])
    openEditor('Pharmacy')
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()

    act(() => push([{ ...pharmacy, referenceCount: 0 }]))

    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled()
    expect(screen.queryByText(SHOP_IN_USE_MESSAGE)).toBeNull()
  })

  it('hands the live record, not the one opened, to deleteShop once the Shop is freed', () => {
    const { push } = renderLive([{ ...pharmacy, referenceCount: 1 }])
    openEditor('Pharmacy')
    act(() => push([{ ...pharmacy, referenceCount: 0 }]))

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(deleteShop).toHaveBeenCalledWith(fakeDb, expect.objectContaining({ referenceCount: 0 }))
  })

  it('hands the live record, not the one opened, to renameShop', () => {
    const { push } = renderLive([pharmacy])
    openEditor('Pharmacy')
    act(() => push([{ ...pharmacy, referenceCount: 3 }]))

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))

    expect(renameShop).toHaveBeenCalledWith(fakeDb, expect.objectContaining({ referenceCount: 3 }), 'Pharmacy')
  })

  it('discards an unsaved draft name when the Shop is deleted elsewhere', async () => {
    const { push } = renderLive([pharmacy, grocery])
    openEditor('Pharmacy')
    fireEvent.input(screen.getByLabelText('Shop name'), { target: { value: 'Chemist' } })

    act(() => push([grocery]))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    act(() => push([pharmacy, grocery]))
    openEditor('Pharmacy')

    expect(screen.getByLabelText('Shop name')).toHaveValue('Pharmacy')
  })

  it('closes the dialog and says the Shop was deleted when it leaves the live list', async () => {
    const { push } = renderLive([pharmacy, grocery], { withSnackbar: true })
    openEditor('Pharmacy')

    act(() => push([grocery]))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('status')).toHaveTextContent(SHOP_DELETED_MESSAGE)
  })

  it('does not report a deletion the dialog made itself as deleted elsewhere', async () => {
    const { push } = renderLive([pharmacy], { withSnackbar: true })
    deleteShop.mockImplementationOnce(() => {
      act(() => push([]))
      return Promise.resolve()
    })
    openEditor('Pharmacy')

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Deleted Pharmacy'))
    expect(screen.getByRole('status')).not.toHaveTextContent(SHOP_DELETED_MESSAGE)
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

  it('clears a delete failure when another Shop is opened', async () => {
    deleteShop.mockRejectedValueOnce(new Error('boom'))
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

describe('closing a Shop dialog over unsaved edits', () => {
  it('asks before the Close button discards a typed new Shop name, and stays open when declined', () => {
    confirmSpy.mockReturnValue(false)
    renderWithShops([])
    fireEvent.click(screen.getByRole('button', { name: 'Add Shop' }))
    fireEvent.input(screen.getByLabelText('New Shop name'), { target: { value: 'Hardware' } })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(confirmSpy).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('New Shop name')).toHaveValue('Hardware')
  })

  it('closes the Add dialog without asking while the name is empty', () => {
    renderWithShops([])
    fireEvent.click(screen.getByRole('button', { name: 'Add Shop' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('asks before the Close button discards a changed Shop name, and stays open when declined', () => {
    confirmSpy.mockReturnValue(false)
    renderWithShops([grocery])
    fireEvent.click(screen.getByRole('button', { name: `Edit ${grocery.name}` }))
    fireEvent.input(screen.getByLabelText('Shop name'), { target: { value: 'Market' } })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(confirmSpy).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('Shop name')).toHaveValue('Market')
  })

  it('closes the Edit dialog without asking while the name is as it opened', () => {
    renderWithShops([grocery])
    fireEvent.click(screen.getByRole('button', { name: `Edit ${grocery.name}` }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('discards an edited name at once from Cancel', () => {
    renderWithShops([grocery])
    fireEvent.click(screen.getByRole('button', { name: `Edit ${grocery.name}` }))
    fireEvent.input(screen.getByLabelText('Shop name'), { target: { value: 'Market' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
