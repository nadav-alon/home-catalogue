import { describe, expect, it } from 'vitest'
import { core } from 'data-platform'
import { DEFAULT_ROUTE, hashOf, isRoute, itemIdsOf, route, routeOf } from './route.ts'

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
