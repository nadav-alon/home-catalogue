import { act, renderHook } from '@testing-library/preact'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_ROUTE, route } from './route.ts'
import { navigate, useRoute } from './useRoute.ts'

afterEach(async () => {
  window.location.hash = ''
  await new Promise((resolve) => setTimeout(resolve))
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
    const { result } = renderHook(() => useRoute())
    expect(result.current).toBe(DEFAULT_ROUTE)
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
})
