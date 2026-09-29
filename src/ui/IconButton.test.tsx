import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/preact'
import HomeIcon from '~icons/material-symbols/home-outline'
import { IconButton } from './IconButton.tsx'
import { tokenUsage } from './cssTokens.ts'

describe('IconButton', () => {
  it('renders a native button named by its label, with a decorative icon', () => {
    const { container } = render(<IconButton symbol={HomeIcon} label="Home" />)
    const button = screen.getByRole('button', { name: 'Home' })
    expect(button.tagName).toBe('BUTTON')
    expect(button).toHaveAttribute('type', 'button')
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('keeps native click and disabled behaviour', () => {
    const onClick = vi.fn()
    const { rerender } = render(<IconButton symbol={HomeIcon} label="Home" onClick={onClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
    rerender(<IconButton symbol={HomeIcon} label="Home" disabled />)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('is styled only from defined tokens', () => {
    const { used, undefinedTokens } = tokenUsage('IconButton.css')
    expect(used.length).toBeGreaterThan(0)
    expect(undefinedTokens).toEqual([])
  })
})
