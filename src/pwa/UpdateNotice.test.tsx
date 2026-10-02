import { act, render, screen } from '@testing-library/preact'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UpdateNotice } from './UpdateNotice.tsx'

type RegisterOptions = { onNeedReload?: () => void }
const registerSW = vi.hoisted(() => vi.fn<(options: RegisterOptions) => void>())
vi.mock('virtual:pwa-register', () => ({ registerSW }))

beforeEach(() => registerSW.mockReset())

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
})
