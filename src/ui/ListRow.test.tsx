import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/preact'
import { ListRow } from './ListRow.tsx'
import { tokenUsage } from './cssTokens.ts'

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
    const { used, undefinedTokens } = tokenUsage('ListRow.css')
    expect(used.length).toBeGreaterThan(0)
    expect(undefinedTokens).toEqual([])
  })
})
