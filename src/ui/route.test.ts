import { describe, expect, it } from 'vitest'
import { catalogue, core, recipes } from 'data-platform'
import { NO_ITEMS_FILTER, addItemHandoffOf, returnUrl, returnUrlWithItem, categoryIdOf, DEFAULT_ROUTE, hashOf, isRoute, itemIdsOf, tagIdsOf, itemsHashOf, route, recipeIdOf, routeOf, shopIdOf, withItemsFilter, withRecipeId } from './route.ts'

const ROUTE_HASHES = ['#/list', '#/items', '#/settings', '#/settings/shops', '#/settings/categories', '#/settings/tags'] as const

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

describe('ItemsFilter in the hash', () => {
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
    const hash = withItemsFilter('#/items?item=a,b', { categoryId: groceries, shopId: pharmacy, recipeId: undefined, tagIds: [] })
    expect(hash).toBe('#/items?item=a,b&category=groceries&shop=pharmacy')
    expect(itemIdsOf(hash)).toEqual([core.itemId('a'), core.itemId('b')])
  })

  it('replaces one and clears the other', () => {
    const hash = withItemsFilter('#/items?category=old&shop=pharmacy', { categoryId: groceries, shopId: undefined, recipeId: undefined, tagIds: [] })
    expect(hash).toBe('#/items?category=groceries')
  })

  it('reads the Recipe from a recipe query, and none when it is absent', () => {
    expect(recipeIdOf('#/items?category=groceries&recipe=pancakes')).toBe(recipes.recipeId('pancakes'))
    expect(recipeIdOf('#/items?item=a')).toBeUndefined()
  })

  it('sets and clears the Recipe, keeping the Item filter', () => {
    expect(withItemsFilter('#/items?item=a', { ...NO_ITEMS_FILTER, recipeId: recipes.recipeId('pancakes') })).toBe('#/items?item=a&recipe=pancakes')
    expect(withItemsFilter('#/items?item=a&recipe=pancakes', NO_ITEMS_FILTER)).toBe('#/items?item=a')
  })

  it('round-trips one Tag through a tag query', () => {
    const hash = withItemsFilter('#/items', { ...NO_ITEMS_FILTER, tagIds: [catalogue.tagId('sweet')] })
    expect(hash).toBe('#/items?tag=sweet')
    expect(tagIdsOf(hash)).toEqual([catalogue.tagId('sweet')])
  })

  it('round-trips several Tags as comma-separated ids, keeping the other filters', () => {
    const tagIds = [catalogue.tagId('sweet'), catalogue.tagId('cooking')]
    const hash = withItemsFilter('#/items?category=groceries', { categoryId: groceries, shopId: undefined, recipeId: undefined, tagIds })
    expect(hash).toBe('#/items?category=groceries&tag=sweet,cooking')
    expect(tagIdsOf(hash)).toEqual(tagIds)
    expect(categoryIdOf(hash)).toBe(groceries)
  })

  it('reads no Tags from a hash without a tag query, and clears the query when none are given', () => {
    expect(tagIdsOf('#/items?category=groceries')).toEqual([])
    expect(withItemsFilter('#/items?tag=sweet,cooking', NO_ITEMS_FILTER)).toBe('#/items')
  })

  it('names the bare Items screen once every filter is cleared', () => {
    expect(withItemsFilter('#/items?category=a&shop=b', NO_ITEMS_FILTER)).toBe('#/items')
  })
})

describe('add-Item hand-off', () => {
  const origin = 'https://example.test'
  const back = 'https://example.test/recipes/#/r/1'

  it('reads the name and a return URL on the catalogue origin', () => {
    const hash = `#/items?add=Flour&return=${encodeURIComponent(back)}`
    expect(addItemHandoffOf(hash, origin)).toEqual({ name: 'Flour', returnUrl: back })
  })

  it('has no hand-off without a name', () => {
    expect(addItemHandoffOf('#/items', origin)).toBeUndefined()
    expect(addItemHandoffOf('#/items?add=%20', origin)).toBeUndefined()
  })

  it('keeps the name and drops a return URL on another origin', () => {
    for (const other of ['https://evil.test/x', 'javascript:alert(1)', '//evil.test', 'https:///evil.test']) {
      expect(addItemHandoffOf(`#/items?add=Flour&return=${encodeURIComponent(other)}`, origin)).toEqual({ name: 'Flour', returnUrl: undefined })
    }
  })

  it('reads a relative return URL as on the catalogue origin', () => {
    expect(addItemHandoffOf(`#/items?add=Flour&return=${encodeURIComponent('/recipes/')}`, origin)).toEqual({ name: 'Flour', returnUrl: 'https://example.test/recipes/' })
  })

  it('appends the new Item id after an existing query', () => {
    expect(returnUrlWithItem(returnUrl('https://example.test/recipes/?a=1#/r/1', origin), core.itemId('i1'))).toBe('https://example.test/recipes/?a=1&itemId=i1#/r/1')
  })

  it('appends the new Item id to the return URL', () => {
    expect(returnUrlWithItem(returnUrl(back, origin), core.itemId('i1'))).toBe('https://example.test/recipes/?itemId=i1#/r/1')
  })

  it('refuses to construct a foreign return URL', () => {
    expect(() => returnUrl('https://evil.test/', origin)).toThrow('Not a ReturnUrl')
  })
})

describe('withRecipeId', () => {
  it('sets and clears the Recipe on the Shopping list, keeping other queries', () => {
    const pancakes = recipes.recipeId('pancakes')
    expect(withRecipeId('#/list', pancakes)).toBe('#/list?recipe=pancakes')
    expect(withRecipeId('#/list?x=1&recipe=old', pancakes)).toBe('#/list?x=1&recipe=pancakes')
    expect(withRecipeId('#/list?x=1&recipe=pancakes', undefined)).toBe('#/list?x=1')
    expect(withRecipeId('#/list?recipe=pancakes', undefined)).toBe('#/list')
  })
})
