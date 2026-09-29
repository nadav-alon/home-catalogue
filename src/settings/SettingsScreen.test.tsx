import { fireEvent, render, screen } from '@testing-library/preact'
import { afterEach, describe, expect, it } from 'vitest'
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

afterEach(resetHash)

describe('SettingsScreen', () => {
  it.each([
    ['Shops', '#/settings/shops'],
    ['Categories', '#/settings/categories'],
  ])('navigates to %s', (name, hash) => {
    render(<SettingsScreen config={config} />)

    const link = screen.getByRole('link', { name: `Open ${name}` })
    expect(link).toHaveAttribute('href', hash)
    fireEvent.click(link)

    expect(window.location.hash).toBe(hash)
  })

  it('shows the QR code from Add a device', async () => {
    render(<SettingsScreen config={config} />)

    fireEvent.click(screen.getByRole('button', { name: 'Show QR code' }))

    expect((await screen.findByRole('img')).innerHTML).toContain('<svg')
  })
})
