import { describe, expect, it } from 'vitest'
import { DEFAULT_ROUTE, hashOf, isRoute, route, routeOf } from './route.ts'

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
})
