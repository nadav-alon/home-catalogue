import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/preact'
import AddIcon from '~icons/material-symbols/add'
import { Fab } from './Fab.tsx'
import { read, tokenUsage } from '../testing/css.ts'

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

  it('keeps the phone offset and, from 600px, insets from the content column rather than the viewport edge', () => {
    const css = read('src/ui/Fab.css').replace(/\s+/g, ' ')
    expect(css).toContain('z-index: 1; right: var(--md-sys-spacing-4);')
    expect(css).toContain(
      'right: max( var(--md-sys-spacing-4), calc((100% - var(--shell-rail-width) - var(--shell-content-width)) / 2 + var(--md-sys-spacing-4)) );',
    )
  })
})
