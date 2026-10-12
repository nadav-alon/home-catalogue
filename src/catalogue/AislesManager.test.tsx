import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { catalogue } from 'data-platform'
import { BLANK_AISLE_NAME_MESSAGE, AislesManager } from './AislesManager.tsx'
import { AISLE_NAME_TAKEN_MESSAGE, AisleNameTakenError, type AisleRecord } from './aisles.ts'
import { TopAppBar } from '../shell/TopAppBar.tsx'
import { SnackbarHost, resetSnackbar } from '../ui/Snackbar.tsx'
import { resetHash } from '../testing/hash.ts'
import { stubModalDialog } from '../testing/dialog.ts'

const watchAisles = vi.fn()
const createAisle = vi.fn()
const renameAisle = vi.fn()
const softDeleteAisle = vi.fn()
const restoreAisle = vi.fn()

vi.mock('./aisles.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./aisles.ts')>()),
  createAisle: (db: unknown, name: string) => createAisle(db, name),
  renameAisle: (db: unknown, aisle: unknown, name: string, aisles: unknown) => renameAisle(db, aisle, name, aisles),
  softDeleteAisle: (db: unknown, aisle: unknown) => softDeleteAisle(db, aisle),
  restoreAisle: (db: unknown, aisle: unknown, aisles: unknown) => restoreAisle(db, aisle, aisles),
  watchAisles: (db: unknown, cb: unknown) => watchAisles(db, cb),
}))

const fakeDb = { name: 'fake-db' } as unknown as Firestore
const aislesUnsubscribe = vi.fn()

const sweet: AisleRecord = { id: catalogue.aisleId('sweet-id'), name: 'Sweet' }
const savoury: AisleRecord = { id: catalogue.aisleId('savoury-id'), name: 'Savoury' }

afterEach(resetHash)

// Closing over unsaved edits asks; tests agree to discard unless they refuse.
let confirmSpy: MockInstance<typeof window.confirm>

afterEach(() => {
  cleanup()
  confirmSpy.mockRestore()
})

beforeEach(() => {
  confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
  stubModalDialog()
  createAisle.mockReset().mockResolvedValue('new-id')
  renameAisle.mockReset().mockResolvedValue(undefined)
  softDeleteAisle.mockReset().mockResolvedValue(undefined)
  restoreAisle.mockReset().mockResolvedValue(undefined)
  resetSnackbar()
  watchAisles.mockReset()
  aislesUnsubscribe.mockClear()
})

function renderWith(aisles: AisleRecord[]) {
  watchAisles.mockImplementation((_db: unknown, cb: (aisles: AisleRecord[]) => void) => {
    cb(aisles)
    return aislesUnsubscribe
  })
  return render(
    <>
      <AislesManager db={fakeDb} />
      <SnackbarHost />
    </>,
  )
}

describe('AislesManager', () => {
  it('has a back arrow in the top app bar’s leading slot that returns to Settings', () => {
    watchAisles.mockReturnValue(aislesUnsubscribe)
    window.location.hash = '#/settings/aisles'
    render(
      <TopAppBar title="Aisles">
        <AislesManager db={fakeDb} />
      </TopAppBar>,
    )

    const banner = screen.getByRole('banner')
    fireEvent.click(within(banner).getByRole('button', { name: 'Back to Settings' }))

    expect(window.location.hash).toBe('#/settings')
  })

  it('lists every live Aisle, whether or not an Item carries it', () => {
    renderWith([sweet, savoury])

    expect(screen.getByText('Sweet')).toBeInTheDocument()
    expect(screen.getByText('Savoury')).toBeInTheDocument()
  })

  it('adds an Aisle from the Add Aisle dialog and closes it', async () => {
    renderWith([sweet])
    fireEvent.click(screen.getByRole('button', { name: 'Add Aisle' }))
    fireEvent.input(screen.getByLabelText('New Aisle name'), { target: { value: 'Frozen' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(createAisle).toHaveBeenCalledWith(fakeDb, 'Frozen')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('refuses a duplicate name in any case or spacing with a message, writing nothing', () => {
    renderWith([sweet])
    fireEvent.click(screen.getByRole('button', { name: 'Add Aisle' }))
    fireEvent.input(screen.getByLabelText('New Aisle name'), { target: { value: ' sWEET ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(screen.getByText(AISLE_NAME_TAKEN_MESSAGE)).toBeInTheDocument()
    expect(createAisle).not.toHaveBeenCalled()
  })

  it('stops watching Aisles on unmount', () => {
    const { unmount } = renderWith([])
    unmount()

    expect(aislesUnsubscribe).toHaveBeenCalled()
  })

  it('renames an Aisle from its Edit dialog against the live Aisles and closes the dialog', async () => {
    renderWith([sweet, savoury])
    fireEvent.click(screen.getByRole('button', { name: 'Edit Sweet' }))
    expect(screen.getByLabelText('Aisle name')).toHaveValue('Sweet')
    fireEvent.input(screen.getByLabelText('Aisle name'), { target: { value: 'Sugary' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(renameAisle).toHaveBeenCalledWith(fakeDb, sweet, 'Sugary', [sweet, savoury])
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('shows a refused rename as an error on the name field and keeps the dialog open', async () => {
    renameAisle.mockRejectedValue(new AisleNameTakenError(AISLE_NAME_TAKEN_MESSAGE))
    renderWith([sweet, savoury])
    fireEvent.click(screen.getByRole('button', { name: 'Edit Sweet' }))
    fireEvent.input(screen.getByLabelText('Aisle name'), { target: { value: ' savoury ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(AISLE_NAME_TAKEN_MESSAGE)
    expect(screen.getByLabelText('Aisle name')).toBeInvalid()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shows a plain sentence, and writes nothing, when the name is cleared', async () => {
    renderWith([sweet, savoury])
    fireEvent.click(screen.getByRole('button', { name: 'Edit Sweet' }))
    fireEvent.input(screen.getByLabelText('Aisle name'), { target: { value: '  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(BLANK_AISLE_NAME_MESSAGE)
    expect(renameAisle).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  describe('closing the Edit dialog', () => {
    it('asks before the Close button discards an edited name, and stays open when declined', () => {
      confirmSpy.mockReturnValue(false)
      renderWith([sweet])
      fireEvent.click(screen.getByRole('button', { name: 'Edit Sweet' }))
      fireEvent.input(screen.getByLabelText('Aisle name'), { target: { value: 'Sugary' } })
      fireEvent.click(screen.getByRole('button', { name: 'Close' }))

      expect(confirmSpy).toHaveBeenCalledOnce()
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByLabelText('Aisle name')).toHaveValue('Sugary')
    })

    it('closes without asking when the name is unchanged', () => {
      renderWith([sweet])
      fireEvent.click(screen.getByRole('button', { name: 'Edit Sweet' }))
      fireEvent.click(screen.getByRole('button', { name: 'Close' }))

      expect(confirmSpy).not.toHaveBeenCalled()
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('discards an edited name at once from Cancel', () => {
      renderWith([sweet])
      fireEvent.click(screen.getByRole('button', { name: 'Edit Sweet' }))
      fireEvent.input(screen.getByLabelText('Aisle name'), { target: { value: 'Sugary' } })
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(confirmSpy).not.toHaveBeenCalled()
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('asks on Escape over an edit, and stays open when declined', () => {
      confirmSpy.mockReturnValue(false)
      renderWith([sweet])
      fireEvent.click(screen.getByRole('button', { name: 'Edit Sweet' }))
      fireEvent.input(screen.getByLabelText('Aisle name'), { target: { value: 'Sugary' } })
      fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))

      expect(confirmSpy).toHaveBeenCalledOnce()
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('saves an edit without asking', async () => {
      renderWith([sweet])
      fireEvent.click(screen.getByRole('button', { name: 'Edit Sweet' }))
      fireEvent.input(screen.getByLabelText('Aisle name'), { target: { value: 'Sugary' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(confirmSpy).not.toHaveBeenCalled()
    })

    it('deletes over an edit without asking', async () => {
      renderWith([sweet])
      fireEvent.click(screen.getByRole('button', { name: 'Edit Sweet' }))
      fireEvent.input(screen.getByLabelText('Aisle name'), { target: { value: 'Sugary' } })
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(confirmSpy).not.toHaveBeenCalled()
    })
  })

  it('deletes an Aisle even while Items carry it, offering Undo that restores it against the live Aisles', async () => {
    renderWith([sweet, savoury])
    fireEvent.click(screen.getByRole('button', { name: 'Edit Sweet' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(softDeleteAisle).toHaveBeenCalledWith(fakeDb, sweet)
    expect(screen.getByText('Deleted Sweet')).toBeInTheDocument()
    expect(restoreAisle).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))

    expect(restoreAisle).toHaveBeenCalledWith(fakeDb, sweet, [sweet, savoury])
  })
})
