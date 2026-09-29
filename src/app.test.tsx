import { act, render, screen, within } from '@testing-library/preact'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { catalogue, core } from 'data-platform'
import { App } from './app'
import type { ItemRecord } from './catalogue/items.ts'
import { firebaseWebConfig } from './firebase/webConfig.ts'

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

afterEach(async () => {
  window.location.hash = ''
  await new Promise((resolve) => setTimeout(resolve))
})

async function goTo(hash: string) {
  await act(async () => {
    window.location.hash = hash
    await new Promise((resolve) => setTimeout(resolve))
  })
}

describe('App', () => {
  it('shows the Shopping list screen by default, titled in the top app bar, with the main navigation', () => {
    render(<App db={fakeDb} config={config} />)

    expect(screen.getByRole('heading', { level: 1, name: 'Shopping list' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Export to Calendar' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Items', level: 2 })).toBeNull()
  })

  it('shows the Items screen on #/items', () => {
    window.location.hash = '#/items'
    render(<App db={fakeDb} config={config} />)

    expect(screen.getByRole('heading', { level: 1, name: 'Items' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Export to Calendar' })).toBeNull()
  })

  it('shows the Settings screen with device transfer, Shops and Categories, and follows the route', async () => {
    render(<App db={fakeDb} config={config} />)
    await goTo('#/settings')

    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Add a device' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Shops' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Categories' })).toBeInTheDocument()
  })

  it('shows one management screen on each Settings sub-route', async () => {
    render(<App db={fakeDb} config={config} />)
    await goTo('#/settings/shops')
    expect(screen.getByRole('heading', { level: 1, name: 'Shops' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: 'Categories' })).toBeNull()

    await goTo('#/settings/categories')
    expect(screen.getByRole('heading', { level: 1, name: 'Categories' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: 'Shops' })).toBeNull()
  })

  it('shows a red AlertBanner when a watched Item is now', () => {
    render(<App db={fakeDb} config={config} />)

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
    expect(within(screen.getByRole('main')).getByRole('link', { name: /shopping list/i })).toHaveAttribute('href', '#/list')
  })
})
