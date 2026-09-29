import { render, screen } from '@testing-library/preact'
import { describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { App } from './app'

vi.mock('./catalogue/shops.ts', () => ({
  watchShops: () => vi.fn(),
}))
vi.mock('./catalogue/categories.ts', () => ({
  watchCategories: () => vi.fn(),
}))
vi.mock('./catalogue/items.ts', () => ({
  watchItems: () => vi.fn(),
}))

const fakeDb = { name: 'fake-db' } as unknown as Firestore

describe('App', () => {
  it('shows the home screen with Shops, Categories and Items management', () => {
    render(<App db={fakeDb} />)

    expect(screen.getByRole('heading', { name: 'Home Catalogue' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Shops' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Categories' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Items' })).toBeInTheDocument()
  })
})
