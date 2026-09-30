import { act, render, renderHook } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { core } from 'data-platform'
import { DEFAULT_ROUTE, hashOf, route } from './route.ts'
import { navigate, navigateToItems, useItemIds, useRoute } from './useRoute.ts'
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
})
