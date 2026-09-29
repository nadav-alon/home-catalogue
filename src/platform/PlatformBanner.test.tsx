import { render, screen } from '@testing-library/preact'
import { describe, expect, it } from 'vitest'
import { read, tokenUsage } from '../testing/css.ts'
import { PlatformBanner } from './PlatformBanner.tsx'

describe('PlatformBanner', () => {
  it('shows nothing while the check has not resolved yet', () => {
    render(<PlatformBanner check={null} />)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows nothing when the platform is ok', () => {
    render(<PlatformBanner check="ok" />)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a banner linking the household setup doc when outdated', () => {
    render(<PlatformBanner check="outdated" />)

    expect(screen.getByRole('alert')).toHaveTextContent('update your platform deploy')
    expect(screen.getByRole('link', { name: 'household setup guide' })).toHaveAttribute(
      'href',
      'https://github.com/nadav-alon/data-platform/blob/main/docs/household-setup.md',
    )
  })

  it('shows the same banner when missing', () => {
    render(<PlatformBanner check="missing" />)

    expect(screen.getByRole('alert')).toHaveTextContent('update your platform deploy')
  })
})

describe('PlatformBanner styling', () => {
  it('is a centred, width-capped card styled only from defined tokens', () => {
    render(<PlatformBanner check="outdated" />)

    expect(screen.getByRole('alert')).toHaveClass('platform-banner')
    expect(read('src/platform/PlatformBanner.css')).toMatch(/margin:[^;]*auto/)
    const { used, undefinedTokens } = tokenUsage('src/platform/PlatformBanner.css')
    expect(used.length).toBeGreaterThan(0)
    expect(undefinedTokens).toEqual([])
  })
})
