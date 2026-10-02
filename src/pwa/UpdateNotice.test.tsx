import { act, fireEvent, render, screen } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UpdateNotice } from './UpdateNotice.tsx'

type RegisterOptions = { onNeedReload?: () => void }
const registerSW = vi.hoisted(() => vi.fn<(options: RegisterOptions) => void>())
vi.mock('virtual:pwa-register', () => ({ registerSW }))

beforeEach(() => registerSW.mockReset())
afterEach(() => vi.unstubAllGlobals())

describe('UpdateNotice', () => {
  it('shows nothing until a newer build has taken over', () => {
    render(<UpdateNotice />)

    expect(registerSW).toHaveBeenCalledOnce()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('says a new version is available once a newer build is installed', () => {
    render(<UpdateNotice />)

    act(() => registerSW.mock.calls[0]![0].onNeedReload?.())

    expect(screen.getByRole('status')).toHaveTextContent('A new version is available.')
  })

  it('reloads onto the new version from the notice', () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...location, reload })
    render(<UpdateNotice />)
    act(() => registerSW.mock.calls[0]![0].onNeedReload?.())

    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))

    expect(reload).toHaveBeenCalledOnce()
  })

  it('hides the notice when dismissed, leaving the app on the old build', () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...location, reload })
    render(<UpdateNotice />)
    act(() => registerSW.mock.calls[0]![0].onNeedReload?.())

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(reload).not.toHaveBeenCalled()
  })
})
