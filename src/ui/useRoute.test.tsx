import { useState } from 'preact/hooks'
import { act, render, renderHook } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { catalogue, core } from 'data-platform'
import { DEFAULT_ROUTE, hashOf, route } from './route.ts'
import { navigate, navigateToItems, setCategoryAndShop, useCategoryAndShop, useItemIds, useRoute } from './useRoute.ts'
import { Dialog } from './Dialog.tsx'
import { stubModalDialog } from '../testing/dialog.ts'
import { resetHash } from '../testing/hash.ts'
import { resetPendingPop } from './pendingPop.ts'

beforeEach(stubModalDialog)

afterEach(async () => {
  vi.restoreAllMocks()
  resetPendingPop()
  await resetHash()
})

function nextHashChange(): Promise<unknown> {
  return new Promise((resolve) => window.addEventListener('hashchange', resolve, { once: true }))
}

describe('useRoute', () => {
  it('starts on the route in the hash', () => {
    window.location.hash = '#/items'
    const { result } = renderHook(() => useRoute())
    expect(result.current).toBe(route('/items'))
  })

  it('starts on the default route when the hash is empty', () => {
    window.location.hash = ''
    const { result } = renderHook(() => useRoute())
    expect(result.current).toBe(DEFAULT_ROUTE)
  })

  it.each(['#/nowhere', ''])('replaces the hash %j with the default route without a history entry', (hash) => {
    window.location.hash = hash
    const entries = window.history.length
    renderHook(() => useRoute())
    expect(window.location.hash).toBe(hashOf(DEFAULT_ROUTE))
    expect(window.history.length).toBe(entries)
  })

  it("replaces a later change to an unknown hash with the default route's hash, keeping only the user's own entry", async () => {
    const { result } = renderHook(() => useRoute())
    window.location.hash = '#/items'
    await act(async () => {
      await nextHashChange()
    })
    const entries = window.history.length
    await act(async () => {
      window.location.hash = '#/nowhere'
      await nextHashChange()
    })
    expect(window.location.hash).toBe(hashOf(DEFAULT_ROUTE))
    expect(window.history.length).toBe(entries + 1)
    expect(result.current).toBe(DEFAULT_ROUTE)

    await act(async () => {
      window.history.back()
      await nextHashChange()
    })
    expect(window.location.hash).toBe('#/items')
    expect(result.current).toBe(route('/items'))
  })

  it('re-renders on hashchange', async () => {
    const { result } = renderHook(() => useRoute())
    await act(async () => {
      window.location.hash = '#/settings/shops'
      await nextHashChange()
    })
    expect(result.current).toBe(route('/settings/shops'))
  })

  it('stops listening once unmounted', () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useRoute())
    unmount()
    expect(remove).toHaveBeenCalledWith('hashchange', expect.any(Function))
    remove.mockRestore()
  })
})

describe('navigate', () => {
  it('pushes a history entry so back returns to the previous route', async () => {
    const { result } = renderHook(() => useRoute())
    const entries = window.history.length
    await act(async () => {
      navigate(route('/items'))
      await nextHashChange()
    })
    expect(window.history.length).toBe(entries + 1)
    expect(result.current).toBe(route('/items'))

    await act(async () => {
      window.history.back()
      await nextHashChange()
    })
    expect(result.current).toBe(DEFAULT_ROUTE)
  })

  it('pushes nothing when the route is already shown', () => {
    window.location.hash = '#/items'
    const entries = window.history.length
    navigate(route('/items'))
    expect(window.history.length).toBe(entries)
  })

  it('pushes nothing when navigating to the default route from an unknown hash', () => {
    window.location.hash = '#/nowhere'
    renderHook(() => useRoute())
    const entries = window.history.length
    navigate(DEFAULT_ROUTE)
    expect(window.location.hash).toBe(hashOf(DEFAULT_ROUTE))
    expect(window.history.length).toBe(entries)
  })
})

describe('navigateToItems', () => {
  it('pushes the Items screen filtered to the ids, so back returns to where the Member was', async () => {
    const { result } = renderHook(() => ({ route: useRoute(), ids: useItemIds() }))
    const ids = [core.itemId('a'), core.itemId('b')]
    await act(async () => {
      navigateToItems(ids)
      await nextHashChange()
    })
    expect(result.current).toEqual({ route: route('/items'), ids })
    expect(window.location.hash).toBe('#/items?item=a,b')
  })

  it('keeps the Category and Shop filters on the current hash', async () => {
    window.location.hash = '#/items?category=groceries&shop=pharmacy'
    const { result } = renderHook(() => ({ filter: useCategoryAndShop(), ids: useItemIds() }))
    await act(async () => {
      navigateToItems([core.itemId('a')])
      await nextHashChange()
    })
    expect(window.location.hash).toBe('#/items?item=a&category=groceries&shop=pharmacy')
    expect(result.current.ids).toEqual([core.itemId('a')])
    expect(result.current.filter).toEqual({ categoryId: catalogue.categoryId('groceries'), shopId: catalogue.shopId('pharmacy') })
  })

  it("waits for a closing Dialog's history pop to land before pushing the filter", async () => {
    const back = vi.spyOn(history, 'back').mockImplementation(() => {})
    const { rerender } = render(
      <Dialog open title="Scan" onClose={() => {}}>
        x
      </Dialog>,
    )
    rerender(
      <Dialog open={false} title="Scan" onClose={() => {}}>
        x
      </Dialog>,
    )
    back.mockRestore()
    const before = window.location.hash
    navigateToItems([core.itemId('a')])
    expect(window.location.hash).toBe(before)
    await act(async () => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
      await nextHashChange()
    })
    expect(window.location.hash).toBe('#/items?item=a')
  })

  it("issues a Dialog's pop before pushing the filter when it is closed in the same tick", async () => {
    window.location.hash = '#/items'
    await nextHashChange()
    let setOpen: (open: boolean) => void = () => {}
    function Host() {
      const [open, set] = useState(true)
      setOpen = set
      return (
        <Dialog open={open} title="Scan" onClose={() => set(false)}>
          x
        </Dialog>
      )
    }
    render(<Host />)
    // jsdom does not drop forward entries on a fragment push, so "back returns to the pre-scan entry" is not observable
    // here; what decides it in a browser is that the pop is issued before the push, which is.
    const order: string[] = []
    const back = history.back.bind(history)
    vi.spyOn(history, 'back').mockImplementation(() => {
      order.push('back')
      back()
    })
    const onHashChange = () => order.push(window.location.hash)
    window.addEventListener('hashchange', onHashChange)
    setOpen(false)
    navigateToItems([core.itemId('a')])
    await new Promise((resolve) => setTimeout(resolve, 50))
    window.removeEventListener('hashchange', onHashChange)
    expect(order.indexOf('back')).toBeGreaterThanOrEqual(0)
    expect(order.indexOf('back')).toBeLessThan(order.indexOf('#/items?item=a'))
  })
})

describe('useCategoryAndShop and setCategoryAndShop', () => {
  const groceries = catalogue.categoryId('groceries')
  const pharmacy = catalogue.shopId('pharmacy')

  it('reads the Category and Shop from the hash', () => {
    window.location.hash = '#/items?category=groceries&shop=pharmacy'
    const { result } = renderHook(() => useCategoryAndShop())
    expect(result.current).toEqual({ categoryId: groceries, shopId: pharmacy })
  })

  it('pushes a history entry with the filter, keeping the scanned Item filter, and re-renders', async () => {
    window.location.hash = '#/items?item=a'
    const { result } = renderHook(() => ({ filter: useCategoryAndShop(), ids: useItemIds() }))
    const before = history.length
    await act(async () => {
      setCategoryAndShop({ categoryId: groceries, shopId: pharmacy })
      await nextHashChange()
    })
    expect(window.location.hash).toBe('#/items?item=a&category=groceries&shop=pharmacy')
    expect(history.length).toBe(before + 1)
    expect(result.current).toEqual({ filter: { categoryId: groceries, shopId: pharmacy }, ids: [core.itemId('a')] })
  })

  it('restores the earlier filter when Back is pressed after a chip press', async () => {
    window.location.hash = '#/items?category=groceries'
    await nextHashChange()
    const { result } = renderHook(() => useCategoryAndShop())
    await act(async () => {
      setCategoryAndShop({ categoryId: undefined, shopId: pharmacy })
      await nextHashChange()
    })
    expect(result.current).toEqual({ categoryId: undefined, shopId: pharmacy })
    await act(async () => {
      history.back()
      await vi.waitFor(() => expect(window.location.hash).toBe('#/items?category=groceries'))
    })
    expect(result.current).toEqual({ categoryId: groceries, shopId: undefined })
  })
})
