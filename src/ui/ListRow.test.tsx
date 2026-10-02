import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/preact'
import { ListRow } from './ListRow.tsx'
import { mediaBlock, outsideMediaBlock, tokenUsage } from '../testing/css.ts'

const narrowQuery = '(max-width: 599.98px)'

const narrowBlock = () => mediaBlock('src/ui/ListRow.css', narrowQuery)
const outsideNarrowBlock = () => outsideMediaBlock('src/ui/ListRow.css', narrowQuery)
const hoverQuery = '(hover: hover)'

const hoverBlock = () => mediaBlock('src/ui/ListRow.css', hoverQuery)
const outsideHoverBlock = () => outsideMediaBlock('src/ui/ListRow.css', hoverQuery)
const stateLayer = 'background: color-mix\\(in srgb, var\\(--md-sys-color-on-surface\\) 8%, transparent\\)'

describe('ListRow', () => {
  it('renders a native list item with headline and supporting text', () => {
    render(
      <ul>
        <ListRow headline="Milk" supporting="Grocery" />
      </ul>,
    )
    const row = screen.getByRole('listitem')
    expect(row).toHaveTextContent('Milk')
    expect(row).toHaveTextContent('Grocery')
  })

  it('marks a muted row for a visual set-back', () => {
    render(
      <ul>
        <ListRow headline="Milk" muted />
        <ListRow headline="Eggs" />
      </ul>,
    )
    const [milk, eggs] = screen.getAllByRole('listitem')
    expect(milk).toHaveClass('ui-list-row--muted')
    expect(eggs).not.toHaveClass('ui-list-row--muted')
  })

  it('omits supporting text and trailing slot when not given', () => {
    const { container } = render(
      <ul>
        <ListRow headline="Milk" />
      </ul>,
    )
    expect(container.querySelector('.ui-list-row__supporting')).toBeNull()
    expect(container.querySelector('.ui-list-row__trailing')).toBeNull()
  })

  it('renders the trailing slot after the text', () => {
    render(
      <ul>
        <ListRow headline="Milk" trailing={<button type="button">Out</button>} />
      </ul>,
    )
    expect(screen.getByRole('listitem')).toContainElement(screen.getByRole('button', { name: 'Out' }))
  })

  it('makes the whole row the label of its control', () => {
    render(
      <ul>
        <ListRow headline="Milk" supporting="running low" control={<input type="checkbox" />} />
      </ul>,
    )
    expect(screen.getByRole('checkbox', { name: /Milk\s*running low/ })).toBeInTheDocument()
    expect(screen.getByText('Milk').closest('label')).toContainElement(screen.getByRole('checkbox'))
  })

  it('calls onActivate when the text is tapped, and not when the trailing control is', () => {
    const onActivate = vi.fn()
    render(
      <ul>
        <ListRow headline="Milk" supporting="Grocery" onActivate={onActivate} trailing={<button type="button">Out</button>} />
      </ul>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Out' }))
    expect(onActivate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Milk Grocery' }))
    expect(onActivate).toHaveBeenCalledOnce()
  })

  it('has no button for the text without onActivate', () => {
    render(
      <ul>
        <ListRow headline="Milk" />
      </ul>,
    )
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('stacks the trailing slot under the text below 600px when asked to', () => {
    render(
      <ul>
        <ListRow headline="Milk" stackTrailing trailing={<button type="button">Out</button>} />
      </ul>,
    )
    expect(screen.getByRole('listitem')).toHaveClass('ui-list-row--stack-trailing')
    expect(narrowBlock()).toMatch(/\.ui-list-row--stack-trailing\s*{[^}]*flex-wrap: wrap/)
    expect(narrowBlock()).toMatch(/\.ui-list-row--stack-trailing \.ui-list-row__text\s*{[^}]*flex-basis: 100%/)
    expect(outsideNarrowBlock()).not.toMatch(/stack-trailing/)
  })

  it('gives a stacked row\'s segmented options a 48px touch target below 600px', () => {
    expect(narrowBlock()).toMatch(/\.ui-list-row--stack-trailing \.ui-segmented__option\s*{[^}]*min-height: 3rem/)
  })

  it('highlights a Settings row link on hover with an 8% on-surface state layer', () => {
    expect(hoverBlock()).toMatch(new RegExp(`\\.ui-list-row__link:hover\\s*{[^}]*${stateLayer}`))
  })

  it('highlights the label of a row with a control on hover', () => {
    expect(hoverBlock()).toMatch(new RegExp(`\\.ui-list-row__label:hover[^{]*{[^}]*${stateLayer}`))
  })

  it('applies no hover highlight outside the hover-capable media query, nor to a plain row', () => {
    expect(outsideHoverBlock()).not.toMatch(/:hover/)
    expect(hoverBlock()).not.toMatch(/\.ui-list-row(--[\w-]+)?:hover/)
  })

  it('is styled only from defined tokens', () => {
    const { used, undefinedTokens } = tokenUsage('src/ui/ListRow.css')
    expect(used.length).toBeGreaterThan(0)
    expect(undefinedTokens).toEqual([])
  })
})
