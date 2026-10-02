import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/preact'
import { Chip } from './Chip.tsx'
import { tokenUsage } from '../testing/css.ts'

describe('Chip', () => {
  it('shows its label beside a close button named by dismissLabel', () => {
    render(<Chip label="Scanned: Toothpaste" dismissLabel="Clear scanned filter" onDismiss={() => {}} />)

    expect(screen.getByText('Scanned: Toothpaste')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear scanned filter' })).toBeInTheDocument()
  })

  it('calls onDismiss when the close button is pressed', () => {
    const onDismiss = vi.fn()
    render(<Chip label="Scanned: Toothpaste" dismissLabel="Clear scanned filter" onDismiss={onDismiss} />)

    fireEvent.click(screen.getByRole('button', { name: 'Clear scanned filter' }))

    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('is styled only from defined tokens', () => {
    const { used, undefinedTokens } = tokenUsage('src/ui/Chip.css')
    expect(used.length).toBeGreaterThan(0)
    expect(undefinedTokens).toEqual([])
  })
})
