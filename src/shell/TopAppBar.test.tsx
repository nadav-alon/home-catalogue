import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/preact'
import { TopAppBar, TopBarActions } from './TopAppBar.tsx'
import { tokenUsage } from '../testing/css.ts'

describe('TopAppBar', () => {
  it('shows the title as the page heading inside a banner', () => {
    render(<TopAppBar title="Items" />)
    const banner = screen.getByRole('banner')
    expect(within(banner).getByRole('heading', { level: 1, name: 'Items' })).toBeInTheDocument()
  })

  it('puts what a screen gives TopBarActions into the bar, not where the screen renders it', () => {
    render(
      <TopAppBar title="Items">
        <section data-testid="screen">
          <TopBarActions>
            <button type="button">Filter</button>
          </TopBarActions>
        </section>
      </TopAppBar>,
    )
    expect(within(screen.getByRole('banner')).getByRole('button', { name: 'Filter' })).toBeInTheDocument()
    expect(within(screen.getByTestId('screen')).queryByRole('button')).toBeNull()
  })

  it('removes a screen’s actions when the screen goes away', () => {
    const { rerender } = render(
      <TopAppBar title="Items">
        <TopBarActions>
          <button type="button">Filter</button>
        </TopBarActions>
      </TopAppBar>,
    )
    rerender(<TopAppBar title="Items">{null}</TopAppBar>)
    expect(screen.queryByRole('button', { name: 'Filter' })).toBeNull()
  })

  it('is styled only from defined tokens', () => {
    const { used, undefinedTokens } = tokenUsage('../shell/TopAppBar.css')
    expect(used.length).toBeGreaterThan(0)
    expect(undefinedTokens).toEqual([])
  })
})
