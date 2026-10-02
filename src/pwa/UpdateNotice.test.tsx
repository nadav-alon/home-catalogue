import { act, fireEvent, render, screen } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { announceNewBuild, registerSW } from '../testing/pwa.ts'
import { tokenUsage } from '../testing/css.ts'
import { UpdateNotice } from './UpdateNotice.tsx'
import { resetUpdateWatch, startUpdateWatch } from './updates.ts'

vi.mock('virtual:pwa-register', async () => (await import('../testing/pwa.ts')).pwaRegisterModule)

beforeEach(() => {
  registerSW.mockReset()
  resetUpdateWatch()
  startUpdateWatch()
})
afterEach(() => vi.unstubAllGlobals())

describe('startUpdateWatch', () => {
  it('registers the service worker once, without any component mounted', () => {
    startUpdateWatch()

    expect(registerSW).toHaveBeenCalledOnce()
  })
})

describe('UpdateNotice', () => {
  // First install and already-current builds never call `onNeedReload` (the plugin routes them to
  // `onOfflineReady` or nothing), so this proves only that the notice does not appear by itself.
  it('shows nothing until the plugin reports a newer build; first installs and current builds never do', () => {
    render(<UpdateNotice />)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('says a new version is available once a newer build is installed', () => {
    render(<UpdateNotice />)

    act(() => announceNewBuild())

    expect(screen.getByRole('status')).toHaveTextContent('A new version is available.')
  })

  it('shows a build announced before it mounted', () => {
    announceNewBuild()

    render(<UpdateNotice />)

    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('does not register again when it remounts', () => {
    const { unmount } = render(<UpdateNotice />)
    unmount()
    render(<UpdateNotice />)

    expect(registerSW).toHaveBeenCalledOnce()
  })

  it('reloads onto the new version from the notice', () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...location, reload })
    render(<UpdateNotice />)
    act(() => announceNewBuild())

    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))

    expect(reload).toHaveBeenCalledOnce()
  })

  it('hides the notice when dismissed, leaving the app on the old build', () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...location, reload })
    render(<UpdateNotice />)
    act(() => announceNewBuild())

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(reload).not.toHaveBeenCalled()
  })

  it('shows the notice again when another build lands after a dismissal', () => {
    render(<UpdateNotice />)
    act(() => announceNewBuild())
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

    act(() => announceNewBuild())

    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('is styled only from defined tokens', () => {
    const { used, undefinedTokens } = tokenUsage('src/pwa/UpdateNotice.css')

    expect(used.length).toBeGreaterThan(0)
    expect(undefinedTokens).toEqual([])
  })
})
