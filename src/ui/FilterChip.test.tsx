import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/preact'
import { FilterChip } from './FilterChip.tsx'
import { tokenUsage } from '../testing/css.ts'

describe('FilterChip', () => {
  it('is a button pressed only while selected', () => {
    const { rerender } = render(<FilterChip label="Pharmacy" selected={false} onToggle={() => {}} />)
    expect(screen.getByRole('button', { name: 'Pharmacy', pressed: false })).toBeInTheDocument()

    rerender(<FilterChip label="Pharmacy" selected onToggle={() => {}} />)
    expect(screen.getByRole('button', { name: 'Pharmacy', pressed: true })).toBeInTheDocument()
  })

  it('calls onToggle when pressed', () => {
    const onToggle = vi.fn()
    render(<FilterChip label="Pharmacy" selected={false} onToggle={onToggle} />)

    fireEvent.click(screen.getByRole('button', { name: 'Pharmacy' }))

    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('is styled only from defined tokens', () => {
    const { used, undefinedTokens } = tokenUsage('src/ui/FilterChip.css')
    expect(used.length).toBeGreaterThan(0)
    expect(undefinedTokens).toEqual([])
  })
})
