import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/preact'
import AddIcon from '~icons/material-symbols/add'
import { Fab } from './Fab.tsx'
import { tokenUsage } from '../testing/css.ts'

describe('Fab', () => {
  it('renders a native button named by its label, with a decorative icon', () => {
    const { container } = render(<Fab symbol={AddIcon} label="Add item" />)
    const button = screen.getByRole('button', { name: 'Add item' })
    expect(button.tagName).toBe('BUTTON')
    expect(button).toHaveAttribute('type', 'button')
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('keeps native click behaviour', () => {
    const onClick = vi.fn()
    render(<Fab symbol={AddIcon} label="Add item" onClick={onClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('is styled only from defined tokens', () => {
    const { used, undefinedTokens } = tokenUsage('src/ui/Fab.css')
    expect(used.length).toBeGreaterThan(0)
    expect(undefinedTokens).toEqual([])
  })
})
