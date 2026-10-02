import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/preact'
import { ListRow } from './ListRow.tsx'
import { tokenUsage } from '../testing/css.ts'

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

  it('is styled only from defined tokens', () => {
    const { used, undefinedTokens } = tokenUsage('src/ui/ListRow.css')
    expect(used.length).toBeGreaterThan(0)
    expect(undefinedTokens).toEqual([])
  })
})
