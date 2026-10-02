import { render, screen, within } from '@testing-library/preact'
import { describe, expect, it } from 'vitest'
import { catalogue, core } from 'data-platform'
import { AlertBanner } from './AlertBanner.tsx'
import { read, tokenUsage } from '../testing/css.ts'

const css = read('src/catalogue/AlertBanner.css')

function item(necessity: catalogue.Necessity, state: core.State) {
  return { necessity, state }
}

describe('AlertBanner', () => {
  it('shows nothing when no Item is soon or now', () => {
    render(<AlertBanner items={[item('essential', 'enough'), item('optional', 'running low')]} />)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows a soon banner naming the count when the worst level is soon', () => {
    render(
      <AlertBanner
        items={[item('important', 'running low'), item('optional', 'out'), item('essential', 'enough')]}
      />,
    )

    const banner = screen.getByRole('status')
    expect(banner).toHaveTextContent('2 Items to buy soon (not urgent)')
    expect(banner).toHaveClass('alert-banner--soon')
    expect(within(banner).queryByRole('link')).toBeNull()
  })

  it('shows a soon banner in the singular for one soon Item', () => {
    render(<AlertBanner items={[item('important', 'running low')]} />)

    expect(screen.getByRole('status')).toHaveTextContent('1 Item to buy soon (not urgent)')
  })

  it('shows a now banner naming the count when any Item is now', () => {
    render(
      <AlertBanner
        items={[
          item('essential', 'out'),
          item('important', 'out'),
          item('optional', 'out'),
          item('essential', 'enough'),
        ]}
      />,
    )

    const banner = screen.getByRole('alert')
    expect(banner).toHaveTextContent('2 urgent Items')
    expect(banner).toHaveClass('alert-banner--now')
    expect(within(banner).queryByRole('link')).toBeNull()
  })

  it('shows a now banner in the singular for one now Item', () => {
    render(<AlertBanner items={[item('essential', 'out')]} />)

    expect(screen.getByRole('alert')).toHaveTextContent('1 urgent Item')
  })

  it('shows only the now banner when both now and soon Items exist', () => {
    render(<AlertBanner items={[item('essential', 'out'), item('important', 'running low')]} />)

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('is styled only from defined tokens, which cover light and dark, and no hard-coded colour', () => {
    const { used, undefinedTokens } = tokenUsage('src/catalogue/AlertBanner.css')
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgb|hsl/i)
    expect(used).toEqual(
      expect.arrayContaining([
        '--md-sys-color-error-container',
        '--md-sys-color-on-error-container',
        '--md-sys-color-secondary-container',
        '--md-sys-color-on-secondary-container',
      ]),
    )
    expect(undefinedTokens).toEqual([])
  })

  it('gives the banner text the standard inset', () => {
    expect(css).toMatch(/\.alert-banner\s*{[^}]*padding:\s*var\(--md-sys-spacing-2\)\s+var\(--md-sys-spacing-4\)/)
  })
})
