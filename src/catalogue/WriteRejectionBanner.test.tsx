import { act, fireEvent, render, screen } from '@testing-library/preact'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WriteRejectionBanner } from './WriteRejectionBanner.tsx'
import { read, tokenUsage } from '../testing/css.ts'
import { reportWriteRejection, resetWriteRejections } from './writeRejections.ts'

const css = read('src/catalogue/WriteRejectionBanner.css')

afterEach(() => {
  resetWriteRejections()
  vi.restoreAllMocks()
})

describe('WriteRejectionBanner', () => {
  it('shows nothing until a write is rejected', () => {
    render(<WriteRejectionBanner />)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('names each rejected write and logs the underlying error', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<WriteRejectionBanner />)

    const err = new Error('permission-denied')
    act(() => {
      reportWriteRejection('State change for Bandages', err)
      reportWriteRejection('new Shop', err)
    })

    const alerts = screen.getAllByRole('alert')
    expect(alerts[0]).toHaveTextContent('Could not save State change for Bandages')
    expect(alerts[1]).toHaveTextContent('Could not save new Shop')
    expect(consoleError).toHaveBeenCalledWith(expect.any(String), err)
  })

  it('dismisses one rejection without hiding the others', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<WriteRejectionBanner />)
    act(() => {
      reportWriteRejection('new Shop', new Error('x'))
      reportWriteRejection('new Category', new Error('x'))
    })

    fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss' })[0]!)

    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save new Category')
  })

  it('is styled only from defined tokens, which cover light and dark, and no hard-coded colour', () => {
    const { used, undefinedTokens } = tokenUsage('src/catalogue/WriteRejectionBanner.css')
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgb|hsl/i)
    expect(used).toEqual(
      expect.arrayContaining(['--md-sys-color-error-container', '--md-sys-color-on-error-container']),
    )
    expect(undefinedTokens).toEqual([])
  })

  it("gives the notice's text and Dismiss button the AlertBanner's inset", () => {
    expect(css).toMatch(
      /\.write-rejection-banner\s*{[^}]*padding:\s*var\(--md-sys-spacing-2\)\s+var\(--md-sys-spacing-4\)/,
    )
  })

  it('carries no inline colour', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<WriteRejectionBanner />)
    act(() => reportWriteRejection('new Shop', new Error('x')))

    expect(screen.getByRole('alert')).not.toHaveAttribute('style')
  })
})
