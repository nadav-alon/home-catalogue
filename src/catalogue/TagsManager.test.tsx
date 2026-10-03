import { fireEvent, render, screen, waitFor, within } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { catalogue } from 'data-platform'
import { TagsManager } from './TagsManager.tsx'
import { TAG_NAME_TAKEN_MESSAGE, type TagRecord } from './tags.ts'
import { TopAppBar } from '../shell/TopAppBar.tsx'
import { SnackbarHost, resetSnackbar } from '../ui/Snackbar.tsx'
import { resetHash } from '../testing/hash.ts'

const watchTags = vi.fn()
const renameTag = vi.fn()
const deleteTag = vi.fn()
const restoreTag = vi.fn()

vi.mock('./tags.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./tags.ts')>()),
  renameTag: (db: unknown, tag: unknown, name: string, tags: unknown) => renameTag(db, tag, name, tags),
  deleteTag: (db: unknown, tag: unknown) => deleteTag(db, tag),
  restoreTag: (db: unknown, tag: unknown, tags: unknown) => restoreTag(db, tag, tags),
  watchTags: (db: unknown, cb: unknown) => watchTags(db, cb),
}))

const fakeDb = { name: 'fake-db' } as unknown as Firestore
const tagsUnsubscribe = vi.fn()

const sweet: TagRecord = { id: catalogue.tagId('sweet-id'), name: 'Sweet' }
const savoury: TagRecord = { id: catalogue.tagId('savoury-id'), name: 'Savoury' }

afterEach(resetHash)

beforeEach(() => {
  // jsdom has no modal dialog; stand in for the browser's open/close bookkeeping.
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  })
  renameTag.mockReset().mockResolvedValue(undefined)
  deleteTag.mockReset().mockResolvedValue(undefined)
  restoreTag.mockReset().mockResolvedValue(undefined)
  resetSnackbar()
  watchTags.mockReset()
  tagsUnsubscribe.mockClear()
})

function renderWith(tags: TagRecord[]) {
  watchTags.mockImplementation((_db: unknown, cb: (tags: TagRecord[]) => void) => {
    cb(tags)
    return tagsUnsubscribe
  })
  return render(
    <>
      <TagsManager db={fakeDb} />
      <SnackbarHost />
    </>,
  )
}

describe('TagsManager', () => {
  it('has a back arrow in the top app bar’s leading slot that returns to Settings', () => {
    watchTags.mockReturnValue(tagsUnsubscribe)
    window.location.hash = '#/settings/tags'
    render(
      <TopAppBar title="Tags">
        <TagsManager db={fakeDb} />
      </TopAppBar>,
    )

    const banner = screen.getByRole('banner')
    fireEvent.click(within(banner).getByRole('button', { name: 'Back to Settings' }))

    expect(window.location.hash).toBe('#/settings')
  })

  it('lists every live Tag, whether or not an Item carries it', () => {
    renderWith([sweet, savoury])

    expect(screen.getByText('Sweet')).toBeInTheDocument()
    expect(screen.getByText('Savoury')).toBeInTheDocument()
  })

  it('stops watching Tags on unmount', () => {
    const { unmount } = renderWith([])
    unmount()

    expect(tagsUnsubscribe).toHaveBeenCalled()
  })

  it('renames a Tag from its Edit dialog against the live Tags and closes the dialog', async () => {
    renderWith([sweet, savoury])
    fireEvent.click(screen.getByRole('button', { name: 'Edit Sweet' }))
    expect(screen.getByLabelText('Tag name')).toHaveValue('Sweet')
    fireEvent.input(screen.getByLabelText('Tag name'), { target: { value: 'Sugary' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(renameTag).toHaveBeenCalledWith(fakeDb, sweet, 'Sugary', [sweet, savoury])
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('shows a refused rename as an error on the name field and keeps the dialog open', async () => {
    renameTag.mockRejectedValue(new Error(TAG_NAME_TAKEN_MESSAGE))
    renderWith([sweet, savoury])
    fireEvent.click(screen.getByRole('button', { name: 'Edit Sweet' }))
    fireEvent.input(screen.getByLabelText('Tag name'), { target: { value: ' savoury ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(TAG_NAME_TAKEN_MESSAGE)
    expect(screen.getByLabelText('Tag name')).toBeInvalid()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('deletes a Tag even while Items carry it, offering Undo that restores it against the live Tags', async () => {
    renderWith([sweet, savoury])
    fireEvent.click(screen.getByRole('button', { name: 'Edit Sweet' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(deleteTag).toHaveBeenCalledWith(fakeDb, sweet)
    expect(screen.getByText('Deleted Sweet')).toBeInTheDocument()
    expect(restoreTag).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))

    expect(restoreTag).toHaveBeenCalledWith(fakeDb, sweet, [sweet, savoury])
  })
})
