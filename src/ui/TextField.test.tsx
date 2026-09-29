import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/preact'
import { TextField } from './TextField.tsx'
import { tokenUsage } from '../testing/css.ts'

describe('TextField', () => {
  it('renders a native input labelled by its label', () => {
    render(<TextField label="Name" />)
    const input = screen.getByLabelText('Name')
    expect(input.tagName).toBe('INPUT')
    expect(input).not.toHaveAttribute('aria-invalid')
  })

  it('passes native input attributes and events through', () => {
    let seen = ''
    render(<TextField label="Name" value="a" type="search" required onInput={(e) => (seen = e.currentTarget.value)} />)
    const input = screen.getByLabelText('Name')
    expect(input).toHaveAttribute('type', 'search')
    expect(input).toBeRequired()
    fireEvent.input(input, { target: { value: 'milk' } })
    expect(seen).toBe('milk')
  })

  it('ties an error to the input as its description and marks it invalid', () => {
    render(<TextField label="Name" error="Required" />)
    const input = screen.getByLabelText('Name')
    expect(input).toBeInvalid()
    expect(input).toHaveAccessibleDescription('Required')
  })

  it('keeps a caller-supplied description alongside the error', () => {
    render(<TextField label="Name" error="Required" aria-describedby="hint" />)
    expect(screen.getByLabelText('Name').getAttribute('aria-describedby')).toContain('hint')
  })

  it('is styled only from defined tokens', () => {
    const { used, undefinedTokens } = tokenUsage('src/ui/Field.css')
    expect(used.length).toBeGreaterThan(0)
    expect(undefinedTokens).toEqual([])
  })
})
