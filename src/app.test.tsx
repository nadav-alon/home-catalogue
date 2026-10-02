import { act, fireEvent, render, screen, within } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { catalogue, core } from 'data-platform'
import { App } from './app'
import type { ItemRecord } from './catalogue/items.ts'
import type { CategoryRecord } from './catalogue/categories.ts'
import { bandages, cleaning, medicine } from './catalogue/testFixtures.ts'
import { firebaseWebConfig } from './firebase/webConfig.ts'
import { resetSnackbar, showSnackbar } from './ui/Snackbar.tsx'
import { resetHash } from './testing/hash.ts'
import { stubModalDialog } from './testing/dialog.ts'
import { announceNewBuild, registerSW } from './testing/pwa.ts'
import { resetUpdateWatch, startUpdateWatch } from './pwa/updates.ts'

vi.mock('virtual:pwa-register', async () => (await import('./testing/pwa.ts')).pwaRegisterModule)

const watchItemsCallbacks: ((items: ItemRecord[]) => void)[] = []
const watchItems = vi.fn((_db: unknown, cb: (items: ItemRecord[]) => void) => {
  watchItemsCallbacks.push(cb)
  return vi.fn()
})

const watchCategoriesCallbacks: ((categories: CategoryRecord[]) => void)[] = []

vi.mock('./catalogue/shops.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./catalogue/shops.ts')>()),
  watchShops: () => vi.fn(),
}))
vi.mock('./catalogue/categories.ts', () => ({
  watchCategories: (_db: unknown, cb: (categories: CategoryRecord[]) => void) => {
    watchCategoriesCallbacks.push(cb)
    return vi.fn()
  },
}))
vi.mock('./catalogue/items.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./catalogue/items.ts')>()),
  watchItems: (db: unknown, cb: (items: ItemRecord[]) => void) => watchItems(db, cb),
  findDeletedItemByBarcode: async () => undefined,
}))

vi.mock('./members/members.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./members/members.ts')>()),
  watchMembers: () => vi.fn(),
}))
vi.mock('./members/invites.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./members/invites.ts')>()),
  watchInvites: () => vi.fn(),
}))
vi.mock('./auth/authClient.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./auth/authClient.ts')>()),
  currentUserUid: () => undefined,
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

beforeEach(stubModalDialog)

afterEach(() => {
  resetSnackbar()
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
    expect(screen.queryByRole('searchbox', { name: 'Search Items' })).toBeNull()
  })

  it('shows a snackbar over any screen', () => {
    render(<App db={fakeDb} config={config} onResetConfig={vi.fn()} onSignOut={vi.fn()} />)

    act(() => showSnackbar({ text: 'Deleted Bandages', action: { label: 'Undo', onAction: vi.fn() } }))

    expect(screen.getByText('Deleted Bandages')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
  })

  it('tells the user on any screen when a new version is available', () => {
    registerSW.mockReset()
    resetUpdateWatch()
    startUpdateWatch()
    render(<App db={fakeDb} config={config} onResetConfig={vi.fn()} onSignOut={vi.fn()} />)

    act(() => announceNewBuild())

    expect(within(screen.getByRole('main')).getByRole('status')).toHaveTextContent('A new version is available.')
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

  it('goes back to the scanned view after the chip is dismissed', async () => {
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

    await act(async () => {
      window.history.back()
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    expect(window.location.hash).toBe('#/items?item=bandages')
    expect(screen.getByRole('button', { name: 'Clear scanned filter' })).toBeInTheDocument()
    expect(screen.queryByText('Tape')).toBeNull()
  })

  it('keeps the Category filter in the hash when a Category chip is pressed, and when the scanned chip is dismissed', async () => {
    window.location.hash = '#/items'
    render(<App db={fakeDb} config={config} onResetConfig={vi.fn()} onSignOut={vi.fn()} />)
    await act(async () => {
      const soap: ItemRecord = { ...bandages, id: core.itemId('soap'), name: 'Dish soap', categoryId: cleaning.id }
      for (const cb of watchItemsCallbacks) cb([bandages, soap])
      for (const cb of watchCategoriesCallbacks) cb([medicine, cleaning])
    })

    await act(async () => {
      within(screen.getByRole('group', { name: 'Filter by Category' })).getByRole('button', { name: 'Cleaning' }).click()
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    expect(window.location.hash).toBe('#/items?category=cleaning')
    expect(screen.getByText('Dish soap')).toBeInTheDocument()
    expect(screen.queryByText('Bandages')).toBeNull()

    window.location.hash = '#/items?item=soap&category=cleaning'
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    await act(async () => {
      screen.getByRole('button', { name: 'Clear scanned filter' }).click()
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    expect(window.location.hash).toBe('#/items?category=cleaning')
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
    expect(screen.getByRole('link', { name: 'Shops' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Categories' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add Shop' })).toBeNull()
  })

  it('shows one management screen on each Settings sub-route', async () => {
    render(<App db={fakeDb} config={config} onResetConfig={vi.fn()} onSignOut={vi.fn()} />)
    await goTo('#/settings/shops')
    expect(screen.getByRole('heading', { level: 1, name: 'Shops' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add Category' })).toBeNull()

    await goTo('#/settings/categories')
    expect(screen.getByRole('heading', { level: 1, name: 'Categories' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add Shop' })).toBeNull()
  })

  it('titles the Members screen with the top app bar heading alone', async () => {
    render(<App db={fakeDb} config={config} onResetConfig={vi.fn()} onSignOut={vi.fn()} />)
    await goTo('#/settings/members')

    const headings = screen.getAllByRole('heading', { name: 'Members' })
    expect(headings).toHaveLength(1)
    expect(headings[0].tagName).toBe('H1')
    expect(screen.getByRole('banner')).toContainElement(headings[0])
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

  it('shows a now-level AlertBanner when a watched Item is now', () => {
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

  it('labels the Item dialog opened from the unknown barcode chooser and duplicates no id', async () => {
    vi.stubGlobal(
      'BarcodeDetector',
      class {
        detect = async () => [{ rawValue: '4006381333931' }]
      },
    )
    const mediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices')
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: async () => ({ getTracks: () => [] }) },
    })
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async () => {})
    onTestFinished(() => {
      play.mockRestore()
      if (mediaDevices) Object.defineProperty(navigator, 'mediaDevices', mediaDevices)
      else Reflect.deleteProperty(navigator, 'mediaDevices')
    })
    window.location.hash = '#/items'
    render(<App db={fakeDb} config={config} onResetConfig={vi.fn()} onSignOut={vi.fn()} />)
    await act(async () => watchItemsCallbacks.forEach((cb) => cb([bandages])))

    fireEvent.click(screen.getByRole('button', { name: 'Scan barcode' }))
    const chooser = await screen.findByRole('dialog', { name: 'Unknown barcode' })
    fireEvent.click(within(chooser).getByRole('button', { name: 'New Item' }))

    const dialog = await screen.findByRole('dialog', { name: 'Add Item' })
    for (const label of ['Name', 'Brand note', 'Category', 'Necessity', 'State', 'Shop override', 'Barcode']) {
      expect(within(dialog).getByLabelText(label)).toBeInTheDocument()
    }
    expect(screen.getByRole('searchbox', { name: 'Search Items' })).toBeInTheDocument()
    const ids = [...document.querySelectorAll('[id]')].map((element) => element.id)
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([])
  })
})
