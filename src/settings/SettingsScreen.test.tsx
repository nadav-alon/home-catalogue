import { fireEvent, render, screen } from '@testing-library/preact'
import { afterEach, describe, expect, it } from 'vitest'
import { SettingsScreen } from './SettingsScreen.tsx'
import { resetHash } from '../testing/hash.ts'

afterEach(resetHash)

describe('SettingsScreen', () => {
  it.each([
    ['Shops', '#/settings/shops'],
    ['Categories', '#/settings/categories'],
  ])('navigates to %s', (name, hash) => {
    render(<SettingsScreen />)

    const link = screen.getByRole('link', { name: `Open ${name}` })
    expect(link).toHaveAttribute('href', hash)
    fireEvent.click(link)

    expect(window.location.hash).toBe(hash)
  })
})
