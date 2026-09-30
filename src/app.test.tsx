import { act, render, screen, within } from '@testing-library/preact'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { catalogue, core } from 'data-platform'
import { App } from './app'
import type { ItemRecord } from './catalogue/items.ts'
import { bandages } from './catalogue/testFixtures.ts'
import { firebaseWebConfig } from './firebase/webConfig.ts'
import { showSnackbar } from './ui/Snackbar.tsx'
import { resetHash } from './testing/hash.ts'

const watchItemsCallbacks: ((items: ItemRecord[]) => void)[] = []
const watchItems = vi.fn((_db: unknown, cb: (items: ItemRecord[]) => void) => {
  watchItemsCallbacks.push(cb)
  return vi.fn()
})

vi.mock('./catalogue/shops.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./catalogue/shops.ts')>()),
  watchShops: () => vi.fn(),
}))
vi.mock('./catalogue/categories.ts', () => ({
  watchCategories: () => vi.fn(),
}))
vi.mock('./catalogue/items.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./catalogue/items.ts')>()),
  watchItems: (db: unknown, cb: (items: ItemRecord[]) => void) => watchItems(db, cb),
}))

const fakeDb = { name: 'fake-db' } as unknown as Firestore

const config = firebaseWebConfig({
  apiKey: 'AIzaSyDOCAbC123dEf456GhI789jKl012-MnO',
  authDomain: 'household.firebaseapp.com',
  projectId: 'household',
  storageBucket: 'household.appspot.com',
  messagingSenderId: '123456789',
  appId: '1:123456789:web:abcdef',
})

afterEach(() => {
  resetHash()
  vi.unstubAllGlobals()
})

async function goTo(hash: string) {
  await act(async () => {
    window.location.hash = hash
    await new Promise((resolve) => setTimeout(resolve))
  })
}

describe('App', () => {
  it('shows the Shopping list screen by default, titled in the top app bar, with the main navigation', () => {
    render(<App db={fakeDb} config={config} onResetConfig={vi.fn()} onSignOut={vi.fn()} />)

    expect(screen.getByRole('heading', { level: 1, name: 'Shopping list' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export to Calendar' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Items', level: 2 })).toBeNull()
  })

  it('shows a snackbar over any screen', () => {
    render(<App db={fakeDb} config={config} onResetConfig={vi.fn()} onSignOut={vi.fn()} />)

    act(() => showSnackbar({ text: 'Deleted Bandages', action: { label: 'Undo', onAction: vi.fn() } }))

    expect(screen.getByText('Deleted Bandages')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
  })

  it('puts Calendar Export in the top app bar on the Shopping list screen', () => {
    render(<App db={fakeDb} config={config} onResetConfig={vi.fn()} onSignOut={vi.fn()} />)

    const bar = screen.getByRole('banner')
    expect(within(bar).getByRole('button', { name: 'Export to Calendar' })).toBeInTheDocument()
    expect(within(screen.getByRole('main')).queryByRole('button', { name: 'Export to Calendar' })).toBeNull()
    expect(within(bar).getAllByRole('heading')).toHaveLength(1)
    expect(within(bar).queryByLabelText('Date')).toBeNull()
  })

  it('shows the Items screen on #/items', () => {
    window.location.hash = '#/items'
    render(<App db={fakeDb} config={config} onResetConfig={vi.fn()} onSignOut={vi.fn()} />)

    expect(screen.getByRole('heading', { level: 1, name: 'Items' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Export to Calendar' })).toBeNull()
  })

  it('filters the Items screen to the Items named in the hash', async () => {
    window.location.hash = '#/items?item=bandages'
    render(<App db={fakeDb} config={config} onResetConfig={vi.fn()} onSignOut={vi.fn()} />)
    await act(async () => {
      const other: ItemRecord = { ...bandages, id: core.itemId('tape'), name: 'Tape' }
      for (const cb of watchItemsCallbacks) cb([bandages, other])
    })

    expect(screen.getByRole('heading', { level: 1, name: 'Items' })).toBeInTheDocument()
    expect(screen.getByText('Bandages')).toBeInTheDocument()
    expect(screen.queryByText('Tape')).toBeNull()
  })

  it('returns to every Item and the search box when the scanned chip is dismissed', async () => {
    window.location.hash = '#/items?item=bandages'
    render(<App db={fakeDb} config={config} onResetConfig={vi.fn()} onSignOut={vi.fn()} />)
    await act(async () => {
      const other: ItemRecord = { ...bandages, id: core.itemId('tape'), name: 'Tape' }
      for (const cb of watchItemsCallbacks) cb([bandages, other])
    })

    await act(async () => {
      screen.getByRole('button', { name: 'Clear scanned filter' }).click()
      await new Promise((resolve) => setTimeout(resolve))
    })

    expect(window.location.hash).toBe('#/items')
    expect(screen.getByText('Tape')).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Search Items' })).toBeInTheDocument()
  })

  it('puts the scan icon in the top app bar on the Items screen when BarcodeDetector exists', () => {
    vi.stubGlobal('BarcodeDetector', class {})
    window.location.hash = '#/items'
    render(<App db={fakeDb} config={config} onResetConfig={vi.fn()} onSignOut={vi.fn()} />)

    expect(within(screen.getByRole('banner')).getByRole('button', { name: 'Scan barcode' })).toBeInTheDocument()
  })

  it('has no scan icon on the Items screen without BarcodeDetector', () => {
    window.location.hash = '#/items'
    render(<App db={fakeDb} config={config} onResetConfig={vi.fn()} onSignOut={vi.fn()} />)

    expect(screen.queryByRole('button', { name: 'Scan barcode' })).toBeNull()
  })

  it('shows the Settings screen with device transfer and links to Shops and Categories, and follows the route', async () => {
    render(<App db={fakeDb} config={config} onResetConfig={vi.fn()} onSignOut={vi.fn()} />)
    await goTo('#/settings')

    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Add a device' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Shops' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Categories' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: 'Shops' })).toBeNull()
  })

  it('shows one management screen on each Settings sub-route', async () => {
    render(<App db={fakeDb} config={config} onResetConfig={vi.fn()} onSignOut={vi.fn()} />)
    await goTo('#/settings/shops')
    expect(screen.getByRole('heading', { level: 1, name: 'Shops' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: 'Categories' })).toBeNull()

    await goTo('#/settings/categories')
    expect(screen.getByRole('heading', { level: 1, name: 'Categories' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: 'Shops' })).toBeNull()
  })

  it('returns from the Shops sub-page to Settings with the back arrow', async () => {
    render(<App db={fakeDb} config={config} onResetConfig={vi.fn()} onSignOut={vi.fn()} />)
    await goTo('#/settings/shops')

    await act(async () => {
      screen.getByRole('button', { name: 'Back to Settings' }).click()
      await new Promise((resolve) => setTimeout(resolve))
    })

    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument()
  })

  it('shows the AlertBanner on the Shopping list screen only',async () => {
    render(<App db={fakeDb} config={config} onResetConfig={vi.fn()} onSignOut={vi.fn()} />)
    const items: ItemRecord[] = [
      {
        id: core.itemId('bandages'),
        name: 'Bandages',
        state: 'out',
        categoryId: catalogue.categoryId('medicine'),
        necessity: catalogue.necessitySchema.parse('essential'),
      },
    ]
    act(() => watchItemsCallbacks.forEach((cb) => cb(items)))
    expect(screen.getByRole('alert')).toHaveTextContent('1 urgent Item')

    await goTo('#/items')
    expect(screen.queryByText(/urgent Item/)).toBeNull()

    await goTo('#/settings')
    expect(screen.queryByText(/urgent Item/)).toBeNull()
  })

  it('shows a red AlertBanner when a watched Item is now', () => {
    render(<App db={fakeDb} config={config} onResetConfig={vi.fn()} onSignOut={vi.fn()} />)

    const items: ItemRecord[] = [
      {
        id: core.itemId('bandages'),
        name: 'Bandages',
        state: 'out',
        categoryId: catalogue.categoryId('medicine'),
        necessity: catalogue.necessitySchema.parse('essential'),
      },
    ]
    act(() => watchItemsCallbacks.forEach((cb) => cb(items)))

    expect(screen.getByRole('alert')).toHaveTextContent('1')
  })
})
