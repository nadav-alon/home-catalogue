import { act, render, screen } from '@testing-library/preact'
import { describe, expect, it, vi } from 'vitest'
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

describe('App', () => {
  it('shows the home screen with the Shopping list, Calendar export, Shops, Categories and Items management', () => {
    render(<App db={fakeDb} config={config} />)

    expect(screen.getByRole('heading', { name: 'Home Catalogue' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Add a device' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Shopping list' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Export to Calendar' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Shops' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Categories' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Items' })).toBeInTheDocument()
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
    expect(screen.getByRole('link', { name: /shopping list/i })).toHaveAttribute('href', '#shopping-list')
  })
})
