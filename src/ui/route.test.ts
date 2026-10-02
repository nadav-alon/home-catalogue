import { describe, expect, it } from 'vitest'
import { catalogue, core } from 'data-platform'
import { categoryIdOf, DEFAULT_ROUTE, hashOf, isRoute, itemIdsOf, itemsHashOf, route, routeOf, shopIdOf, withCategoryAndShop } from './route.ts'

const ROUTE_HASHES = ['#/list', '#/items', '#/settings', '#/settings/shops', '#/settings/categories'] as const

describe('route', () => {
  it.each(ROUTE_HASHES)('maps %s to a route and back', (hash) => {
    expect(hashOf(routeOf(hash))).toBe(hash)
  })

  it('guards route values', () => {
    expect(isRoute('/settings/shops')).toBe(true)
    expect(isRoute('/nowhere')).toBe(false)
    expect(route('/items')).toBe('/items')
    expect(() => route('/nowhere')).toThrow('Not a route: "/nowhere"')
    expect(() => route('')).toThrow('Not a route: ""')
  })

  it('resolves an empty hash to the default route', () => {
    expect(routeOf('')).toBe(DEFAULT_ROUTE)
    expect(routeOf('#')).toBe(DEFAULT_ROUTE)
  })

  it('resolves an unknown hash to the default route', () => {
    expect(routeOf('#/nowhere')).toBe(DEFAULT_ROUTE)
    expect(routeOf('#/list/extra')).toBe(DEFAULT_ROUTE)
  })

  it('defaults to the Shopping list', () => {
    expect(hashOf(DEFAULT_ROUTE)).toBe('#/list')
  })

  it('ignores a query when resolving the route', () => {
    expect(routeOf('#/items?item=a,b')).toBe(route('/items'))
  })

  it('ignores a query on any route, not only /items', () => {
    expect(routeOf('#/settings?item=a')).toBe(route('/settings'))
    expect(routeOf('#/list?x')).toBe(route('/list'))
    expect(routeOf('#/nowhere?item=a')).toBe(DEFAULT_ROUTE)
  })

  it('reads the Item ids from the item query', () => {
    expect(itemIdsOf('#/items?item=a,b')).toEqual([core.itemId('a'), core.itemId('b')])
    expect(itemIdsOf('#/items?item=a')).toEqual([core.itemId('a')])
  })

  it('reads no Item ids when the query is absent or empty', () => {
    expect(itemIdsOf('#/items')).toEqual([])
    expect(itemIdsOf('#/items?item=')).toEqual([])
    expect(itemIdsOf('')).toEqual([])
  })
})

describe('itemsHashOf', () => {
  it('names the Items screen filtered to the ids, which itemIdsOf reads back', () => {
    const ids = [core.itemId('a'), core.itemId('b')]
    expect(itemsHashOf(ids)).toBe('#/items?item=a,b')
    expect(itemIdsOf(itemsHashOf(ids))).toEqual(ids)
  })

  it('names the unfiltered Items screen when there are no ids', () => {
    expect(itemsHashOf([])).toBe('#/items')
  })
})

describe('Category and Shop filter in the hash', () => {
  const groceries = catalogue.categoryId('groceries')
  const pharmacy = catalogue.shopId('pharmacy')

  it('reads the Category and Shop ids from the category and shop queries', () => {
    expect(categoryIdOf('#/items?category=groceries&shop=pharmacy')).toBe(groceries)
    expect(shopIdOf('#/items?category=groceries&shop=pharmacy')).toBe(pharmacy)
  })

  it('reads none when the query is absent or empty', () => {
    expect(categoryIdOf('#/items')).toBeUndefined()
    expect(categoryIdOf('#/items?category=')).toBeUndefined()
    expect(shopIdOf('#/items?item=a')).toBeUndefined()
  })

  it('sets the Category and Shop, keeping the Item filter', () => {
    const hash = withCategoryAndShop('#/items?item=a,b', { categoryId: groceries, shopId: pharmacy })
    expect(hash).toBe('#/items?item=a,b&category=groceries&shop=pharmacy')
    expect(itemIdsOf(hash)).toEqual([core.itemId('a'), core.itemId('b')])
  })

  it('replaces one and clears the other', () => {
    const hash = withCategoryAndShop('#/items?category=old&shop=pharmacy', { categoryId: groceries, shopId: undefined })
    expect(hash).toBe('#/items?category=groceries')
  })

  it('names the bare Items screen once both are cleared', () => {
    expect(withCategoryAndShop('#/items?category=a&shop=b', { categoryId: undefined, shopId: undefined })).toBe('#/items')
  })
})
