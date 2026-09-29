import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/preact'
import { TextArea } from './TextArea.tsx'

describe('TextArea', () => {
  it('renders a native textarea labelled by its label and passes input events through', () => {
    let seen = ''
    render(<TextArea label="Notes" onInput={(e) => (seen = e.currentTarget.value)} />)
    const area = screen.getByLabelText('Notes')
    expect(area.tagName).toBe('TEXTAREA')
    fireEvent.input(area, { target: { value: 'hi' } })
    expect(seen).toBe('hi')
  })

  it('announces an error as an alert, describes the field by it and marks it invalid', () => {
    render(<TextArea label="Notes" error="Too short" />)
    const area = screen.getByLabelText('Notes')
    expect(screen.getByRole('alert')).toHaveTextContent('Too short')
    expect(area).toBeInvalid()
    expect(area).toHaveAccessibleDescription('Too short')
  })

  it('shows no alert without an error', () => {
    render(<TextArea label="Notes" />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
