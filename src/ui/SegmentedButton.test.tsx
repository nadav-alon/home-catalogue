import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/preact'
import { SegmentedButton } from './SegmentedButton.tsx'
import { tokenUsage } from '../testing/css.ts'

const options = [
  { value: 'enough', label: 'Enough' },
  { value: 'low', label: 'Running low' },
  { value: 'out', label: 'Out' },
]

describe('SegmentedButton', () => {
  it('renders a native button per option inside a named group', () => {
    render(<SegmentedButton label="State" options={options} value="low" onChange={() => {}} />)
    expect(screen.getByRole('group', { name: 'State' })).toBeInTheDocument()
    const buttons = screen.getAllByRole('button')
    expect(buttons.map((b) => b.tagName)).toEqual(['BUTTON', 'BUTTON', 'BUTTON'])
    expect(buttons.every((b) => b.getAttribute('type') === 'button')).toBe(true)
  })

  it('exposes aria-pressed on every option, true only for the selected one', () => {
    render(<SegmentedButton label="State" options={options} value="low" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Enough' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Running low' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Out' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('reports the clicked option', () => {
    const onChange = vi.fn()
    render(<SegmentedButton label="State" options={options} value="low" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Out' }))
    expect(onChange).toHaveBeenCalledWith('out')
  })

  it('is styled only from defined tokens', () => {
    const { used, undefinedTokens } = tokenUsage('src/ui/SegmentedButton.css')
    expect(used.length).toBeGreaterThan(0)
    expect(undefinedTokens).toEqual([])
  })
})
