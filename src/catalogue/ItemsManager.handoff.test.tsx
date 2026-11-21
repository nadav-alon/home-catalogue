import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { core } from 'data-platform'
import { ItemsManager } from './ItemsManager.tsx'
import { useAddItemHandoff } from '../ui/useRoute.ts'
import { resetHash } from '../testing/hash.ts'
import { stubModalDialog } from '../testing/dialog.ts'
import { choose } from '../testing/select.ts'
import { resetPendingPop } from '../ui/pendingPop.ts'
import { medicine, pharmacy } from './testFixtures.ts'

// Everything the hand-off touches is real here — Dialog, its history entry, the router — except the data layer.
const createItem = vi.fn()
vi.mock('./items.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./items.ts')>()),
  watchItems: (_db: unknown, cb: (items: unknown[]) => void) => {
    cb([])
    return vi.fn()
  },
  createItem: (db: unknown, input: unknown) => createItem(db, input),
}))
vi.mock('./categories.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./categories.ts')>()),
  watchCategories: (_db: unknown, cb: (rows: unknown[]) => void) => {
    cb([medicine])
    return vi.fn()
  },
}))
vi.mock('./shops.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./shops.ts')>()),
  watchShops: (_db: unknown, cb: (rows: unknown[]) => void) => {
    cb([pharmacy])
    return vi.fn()
  },
}))
vi.mock('./aisles.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./aisles.ts')>()),
  watchAisles: (_db: unknown, cb: (rows: unknown[]) => void) => {
    cb([])
    return vi.fn()
  },
}))
vi.mock('./tags.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./tags.ts')>()),
  watchTags: (_db: unknown, cb: (rows: unknown[]) => void) => {
    cb([])
    return vi.fn()
  },
}))

const fakeDb = {} as unknown as Firestore
const newId = core.itemId('new-item')
// jsdom only follows a same-document navigation. A save is expected to add the new id to the return URL, so its page already
// carries that id and the return URL a stale one: a return URL not given exactly that `itemId` would be another document.
const savedBack = `${window.location.origin}/?itemId=stale#/list`
const cancelledBack = `${window.location.origin}/#/list`

function Screen() {
  return <ItemsManager db={fakeDb} handoff={useAddItemHandoff()} />
}

/** Follows a hand-off link: the catalogue is already open, then the link's hash is entered as a new history entry. */
async function followLink(hash: string, search = '') {
  history.replaceState(null, '', `/${search}#/items`)
  await new Promise((resolve) => setTimeout(resolve))
  render(<Screen />)
  window.location.hash = hash
  await screen.findByRole('dialog', { name: 'Add Item' })
  // Wait for the dialog's own history entry.
  await waitFor(() => expect(history.state).toMatchObject({ 'ui-dialog': expect.any(String) }))
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

async function save() {
  createItem.mockResolvedValue(newId)
  choose(screen.getByLabelText('Category'), medicine.id)
  choose(screen.getByLabelText('Necessity'), 'essential')
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
}

beforeEach(() => {
  stubModalDialog()
  createItem.mockReset()
})

afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  resetPendingPop()
  await resetHash()
})

describe('closing a dialog opened by an add-Item hand-off', () => {
  const linkTo = (back: string) => `#/items?add=Flour&return=${encodeURIComponent(back)}`
  const savedPage = `?itemId=${newId}`

  it('ends at the return URL with the new Item id after a save', async () => {
    await followLink(linkTo(savedBack), savedPage)
    await save()

    await waitFor(() => expect(window.location.hash).toBe('#/list'))
    await settle()
    expect(window.location.hash).toBe('#/list')
  })

  it('ends at the return URL without an id after a cancel', async () => {
    await followLink(linkTo(cancelledBack))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(window.location.hash).toBe('#/list'))
    await settle()
    expect(window.location.hash).toBe('#/list')
  })

  it.each(['save', 'cancel'])('does not reopen when going back into the catalogue after a %s', async (how) => {
    await followLink(linkTo(how === 'save' ? savedBack : cancelledBack), how === 'save' ? savedPage : '')
    if (how === 'save') await save()
    else fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/list/))
    await settle()
    window.history.back()
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/items/))
    await settle()

    expect(window.location.hash).not.toContain('add=')
    expect(screen.queryByRole('dialog', { name: 'Add Item' })).not.toBeInTheDocument()
  })

  it.each(['save', 'cancel'])('drops the hand-off from the URL after a %s without a return URL', async (how) => {
    await followLink('#/items?add=Flour')
    if (how === 'save') await save()
    else fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add Item' })).not.toBeInTheDocument())
    await settle()

    expect(window.location.hash).toBe('#/items')
  })
})
