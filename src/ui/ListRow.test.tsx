import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/preact'
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

  it('is styled only from defined tokens', () => {
    const { used, undefinedTokens } = tokenUsage('src/ui/ListRow.css')
    expect(used.length).toBeGreaterThan(0)
    expect(undefinedTokens).toEqual([])
  })
})
