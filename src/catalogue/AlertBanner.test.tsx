import { render, screen } from '@testing-library/preact'
import { describe, expect, it } from 'vitest'
import { catalogue, core } from 'data-platform'
import { AlertBanner } from './AlertBanner.tsx'

function item(necessity: catalogue.Necessity, state: core.State) {
  return { necessity, state }
}

describe('AlertBanner', () => {
  it('shows nothing when no Item is soon or now', () => {
    render(<AlertBanner items={[item('essential', 'enough'), item('optional', 'running low')]} />)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows a yellow banner naming the count and linking the shopping list when the worst level is soon', () => {
    render(
      <AlertBanner
        items={[item('important', 'running low'), item('optional', 'out'), item('essential', 'enough')]}
      />,
    )

    const banner = screen.getByRole('status')
    expect(banner).toHaveTextContent('2 Items to buy soon (not urgent)')
    expect(banner).toHaveStyle({ backgroundColor: '#fef9c3' })
    expect(screen.getByRole('link', { name: /shopping list/i })).toHaveAttribute('href', '#shopping-list')
  })

  it('shows a yellow banner in the singular for one soon Item', () => {
    render(<AlertBanner items={[item('important', 'running low')]} />)

    expect(screen.getByRole('status')).toHaveTextContent('1 Item to buy soon (not urgent)')
  })

  it('shows a red banner naming the count and linking the shopping list when any Item is now', () => {
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
    expect(banner).toHaveStyle({ backgroundColor: '#fee2e2' })
    expect(screen.getByRole('link', { name: /shopping list/i })).toHaveAttribute('href', '#shopping-list')
  })

  it('shows a red banner in the singular for one now Item', () => {
    render(<AlertBanner items={[item('essential', 'out')]} />)

    expect(screen.getByRole('alert')).toHaveTextContent('1 urgent Item')
  })

  it('shows only the red banner when both now and soon Items exist', () => {
    render(<AlertBanner items={[item('essential', 'out'), item('important', 'running low')]} />)

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
