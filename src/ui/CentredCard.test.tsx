import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/preact'
import { CentredCard } from './CentredCard.tsx'
import { read, tokenUsage } from '../testing/css.ts'

describe('CentredCard', () => {
  it('shows the app name, the screen heading and its content, with no navigation', () => {
    render(
      <CentredCard title="Sign in">
        <p>Hello</p>
      </CentredCard>,
    )
    expect(screen.getByText('Home Catalogue')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('is a single centred column with a width cap and no width breakpoints', () => {
    const css = read('CentredCard.css')
    expect(css).toMatch(/flex-direction:\s*column/)
    expect(css).toMatch(/align-items:\s*center/)
    expect(css).toMatch(/max-width:/)
    expect(css).not.toMatch(/@media/)
  })

  it('is styled only from defined tokens, which cover light and dark', () => {
    const { used, undefinedTokens } = tokenUsage('CentredCard.css')
    expect(used.length).toBeGreaterThan(0)
    expect(undefinedTokens).toEqual([])
  })
})
