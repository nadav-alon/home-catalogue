import { fireEvent, render, screen } from '@testing-library/preact'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsScreen } from './SettingsScreen.tsx'
import { resetHash } from '../testing/hash.ts'
import { firebaseWebConfig } from '../firebase/webConfig.ts'

const config = firebaseWebConfig({
  apiKey: 'AIzaSyDOCAbC123dEf456GhI789jKl012-MnO',
  authDomain: 'household.firebaseapp.com',
  projectId: 'household',
  storageBucket: 'household.appspot.com',
  messagingSenderId: '123456789',
  appId: '1:123456789:web:abcdef',
})

const onResetConfig = vi.fn()
const onSignOut = vi.fn()

afterEach(async () => {
  vi.restoreAllMocks()
  onResetConfig.mockReset()
  onSignOut.mockReset()
  await resetHash()
})

describe('SettingsScreen', () => {
  it.each([
    ['Shops', '#/settings/shops'],
    ['Categories', '#/settings/categories'],
  ])('navigates to %s', (name, hash) => {
    render(<SettingsScreen config={config} onResetConfig={onResetConfig} onSignOut={onSignOut} />)

    const link = screen.getByRole('link', { name: `Open ${name}` })
    expect(link).toHaveAttribute('href', hash)
    fireEvent.click(link)

    expect(window.location.hash).toBe(hash)
  })

  it('shows the QR code from Add a device', async () => {
    render(<SettingsScreen config={config} onResetConfig={onResetConfig} onSignOut={onSignOut} />)

    fireEvent.click(screen.getByRole('button', { name: 'Show QR code' }))

    expect((await screen.findByRole('img')).innerHTML).toContain('<svg')
  })

  it('resets the Firebase configuration only after the user confirms', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    render(<SettingsScreen config={config} onResetConfig={onResetConfig} onSignOut={onSignOut} />)
    const reset = screen.getByRole('button', { name: 'Reset Firebase configuration' })

    fireEvent.click(reset)
    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(onResetConfig).not.toHaveBeenCalled()

    fireEvent.click(reset)
    expect(onResetConfig).toHaveBeenCalledTimes(1)
  })

  it('signs out', () => {
    render(<SettingsScreen config={config} onResetConfig={onResetConfig} onSignOut={onSignOut} />)

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(onSignOut).toHaveBeenCalledTimes(1)
  })
})
