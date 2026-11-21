import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { core } from 'data-platform'
import { ItemsManager } from './ItemsManager.tsx'
import { useAddItemHandoff } from '../ui/useRoute.ts'
import { resetHash } from '../testing/hash.ts'
import { nextTask } from '../testing/nextTask.ts'
import { saveNewItem } from '../testing/saveItem.ts'
import { stubModalDialog } from '../testing/dialog.ts'
import { resetPendingPop } from '../ui/pendingPop.ts'
import { medicine, pharmacy } from './testFixtures.ts'

// Everything the hand-off touches is real here — Dialog, its history entry, the router — except the data layer.
const createItem = vi.fn()
/** The order of the history pops and of leaving the app, to show a leave never precedes the pop that would cancel it. */
const events: string[] = []
const recordPop = () => events.push('popstate')
vi.mock('../ui/useRoute.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ui/useRoute.ts')>()
  return {
    ...actual,
    leaveTo: (...args: Parameters<typeof actual.leaveTo>) => {
      events.push('leave')
      actual.leaveTo(...args)
    },
  }
})
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

/** Mounts alongside the screen and records what `useAddItemHandoff` returns on each render. */
function Probe({ into }: { into: { current: ReturnType<typeof useAddItemHandoff> } }) {
  into.current = useAddItemHandoff()
  return null
}

/** Follows a hand-off link: the catalogue is already open, then the link's hash is entered as a new history entry. */
async function followLink(hash: string, search = '') {
  history.replaceState(null, '', `/${search}#/items`)
  await nextTask()
  render(<Screen />)
  window.location.hash = hash
  await screen.findByRole('dialog', { name: 'Add Item' })
  // Wait for the dialog's own history entry.
  await waitFor(() => expect(history.state).toMatchObject({ 'ui-dialog': expect.any(String) }))
  events.length = 0
}

/** Long enough for a navigation or history traversal the code under test wrongly issued later to have landed. */
const letStrayNavigationsLand = () => nextTask(20)

beforeEach(() => {
  stubModalDialog()
  createItem.mockReset()
  events.length = 0
  window.addEventListener('popstate', recordPop)
})

afterEach(async () => {
  window.removeEventListener('popstate', recordPop)
  cleanup()
  vi.restoreAllMocks()
  resetPendingPop()
  await resetHash()
})

const closeBySaving = () => saveNewItem(createItem, newId, medicine.id)
const closeByCancelling = () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

const linkTo = (back: string) => `#/items?add=Flour&return=${encodeURIComponent(back)}`

/** How a hand-off dialog is closed, the page its link was followed from, and where a link with a return URL leads. */
const ways = [
  { how: 'save', close: closeBySaving, page: `?itemId=${newId}`, back: savedBack },
  { how: 'cancel', close: closeByCancelling, page: '', back: cancelledBack },
]

describe('closing a dialog opened by an add-Item hand-off', () => {
  it.each(ways)('ends at the return URL after a $how, once the dialog has popped its own entry', async ({ close, page, back }) => {
    await followLink(linkTo(back), page)
    close()

    await waitFor(() => expect(window.location.hash).toBe('#/list'))
    await letStrayNavigationsLand()
    expect(window.location.hash).toBe('#/list')
    // Leaving before the pop has landed would let the pop cancel the navigation, as it does in a browser.
    expect(events.slice(0, 2)).toEqual(['popstate', 'leave'])
  })

  it.each(ways)('does not reopen when going back into the catalogue after a $how', async ({ close, page, back }) => {
    await followLink(linkTo(back), page)
    close()
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/list/))
    await letStrayNavigationsLand()
    window.history.back()
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/items/))
    await letStrayNavigationsLand()

    expect(events.slice(0, 2)).toEqual(['popstate', 'leave'])
    expect(window.location.hash).not.toContain('add=')
    expect(screen.queryByRole('dialog', { name: 'Add Item' })).not.toBeInTheDocument()
  })

  it.each(ways)('drops the hand-off from the URL after a $how without a return URL, so a reload does not reopen it', async ({ close }) => {
    await followLink('#/items?add=Flour')
    close()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add Item' })).not.toBeInTheDocument())
    await letStrayNavigationsLand()

    expect(window.location.hash).toBe('#/items')
    cleanup()
    render(<Screen />)
    await letStrayNavigationsLand()
    expect(screen.queryByRole('dialog', { name: 'Add Item' })).not.toBeInTheDocument()
  })

  it.each(ways)('opens the dialog again when the same link is followed after a $how without a return URL', async ({ close }) => {
    await followLink('#/items?add=Flour')
    close()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add Item' })).not.toBeInTheDocument())
    await letStrayNavigationsLand()

    window.location.hash = '#/items?add=Flour'
    const dialog = await screen.findByRole('dialog', { name: 'Add Item' })
    expect(within(dialog).getByDisplayValue('Flour')).toBeInTheDocument()
  })

  it.each(ways)('stops reporting the hand-off after a $how without a return URL', async ({ close }) => {
    await followLink('#/items?add=Flour')
    const probe = { current: undefined as ReturnType<typeof useAddItemHandoff> }
    render(<Probe into={probe} />)
    expect(probe.current).toBeDefined()
    close()
    await waitFor(() => expect(window.location.hash).toBe('#/items'))
    expect(probe.current).toBeUndefined()
  })
})
