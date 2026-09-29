import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/preact'
import { Select } from './Select.tsx'

describe('Select', () => {
  it('renders a native select labelled by its label, with native options', () => {
    render(
      <Select label="Shop">
        <option value="pharmacy">Pharmacy</option>
        <option value="grocery">Grocery</option>
      </Select>,
    )
    const select = screen.getByLabelText('Shop')
    expect(select.tagName).toBe('SELECT')
    expect(screen.getAllByRole('option')).toHaveLength(2)
  })

  it('passes native attributes and change events through', () => {
    let seen = ''
    render(
      <Select label="Shop" required onChange={(e) => (seen = e.currentTarget.value)}>
        <option value="pharmacy">Pharmacy</option>
        <option value="grocery">Grocery</option>
      </Select>,
    )
    const select = screen.getByLabelText('Shop')
    expect(select).toBeRequired()
    fireEvent.change(select, { target: { value: 'grocery' } })
    expect(seen).toBe('grocery')
  })
})
