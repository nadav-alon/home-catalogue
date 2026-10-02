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
    ['Members', '#/settings/members'],
  ])('navigates to %s', (name, hash) => {
    render(<SettingsScreen config={config} onResetConfig={onResetConfig} onSignOut={onSignOut} />)

    const link = screen.getByRole('link', { name })
    expect(link).toHaveAttribute('href', hash)
    fireEvent.click(link)

    expect(window.location.hash).toBe(hash)
  })

  it('navigates when the row text is tapped, not only the chevron', () => {
    render(<SettingsScreen config={config} onResetConfig={onResetConfig} onSignOut={onSignOut} />)

    fireEvent.click(screen.getByText('Shops'))

    expect(window.location.hash).toBe('#/settings/shops')
  })

  it('gives each navigation row one link, with the chevron hidden inside it', () => {
    render(<SettingsScreen config={config} onResetConfig={onResetConfig} onSignOut={onSignOut} />)

    const link = screen.getByRole('link', { name: 'Shops' })
    expect(link.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(link.closest('li')?.querySelectorAll('a, button')).toHaveLength(1)
  })

  it('makes the link the only child of its row, which has no padding of its own', () => {
    render(<SettingsScreen config={config} onResetConfig={onResetConfig} onSignOut={onSignOut} />)

    const row = screen.getByRole('link', { name: 'Shops' }).closest('li')

    expect(row?.children).toHaveLength(1)
    expect(row?.firstElementChild?.tagName).toBe('A')
    expect(row).toHaveClass('ui-list-row--labelled')
  })

  it('puts the chevron in the trailing slot, which takes its colour from the on-surface-variant token', () => {
    render(<SettingsScreen config={config} onResetConfig={onResetConfig} onSignOut={onSignOut} />)

    const trailing = screen.getByRole('link', { name: 'Shops' }).querySelector('.ui-list-row__trailing')

    expect(trailing?.querySelector('svg')).not.toBeNull()
  })

  it('lists Members above Add device', () => {
    render(<SettingsScreen config={config} onResetConfig={onResetConfig} onSignOut={onSignOut} />)

    const members = screen.getByRole('link', { name: 'Members' })
    const addDevice = screen.getByRole('button', { name: 'Show QR code' })

    expect(members.compareDocumentPosition(addDevice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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

  it('gives every row action the tonal button style', () => {
    render(<SettingsScreen config={config} onResetConfig={onResetConfig} onSignOut={onSignOut} />)

    for (const name of ['Show QR code', 'Reset Firebase configuration', 'Sign out']) {
      expect(screen.getByRole('button', { name }).classList.contains('ui-button--tonal')).toBe(true)
    }
  })

  it('signs out', () => {
    render(<SettingsScreen config={config} onResetConfig={onResetConfig} onSignOut={onSignOut} />)

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(onSignOut).toHaveBeenCalledTimes(1)
  })
})
