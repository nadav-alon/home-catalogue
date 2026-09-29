import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/preact'
import { Button } from './Button.tsx'
import { tokenUsage } from '../testing/css.ts'

describe('Button', () => {
  it('renders a native button that does not submit by default', () => {
    render(<Button>Save</Button>)
    const button = screen.getByRole('button', { name: 'Save' })
    expect(button.tagName).toBe('BUTTON')
    expect(button).toHaveAttribute('type', 'button')
  })

  it('is filled unless told otherwise, and offers tonal and text', () => {
    const { rerender } = render(<Button>Save</Button>)
    expect(screen.getByRole('button')).toHaveClass('ui-button', 'ui-button--filled')
    rerender(<Button variant="tonal">Save</Button>)
    expect(screen.getByRole('button')).toHaveClass('ui-button--tonal')
    rerender(<Button variant="text">Save</Button>)
    expect(screen.getByRole('button')).toHaveClass('ui-button--text')
  })

  it('keeps native click and disabled behaviour', () => {
    const onClick = vi.fn()
    const { rerender } = render(<Button onClick={onClick}>Save</Button>)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
    rerender(<Button disabled onClick={onClick}>Save</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('is styled only from defined tokens', () => {
    const { used, undefinedTokens } = tokenUsage('src/ui/Button.css')
    expect(used.length).toBeGreaterThan(0)
    expect(undefinedTokens).toEqual([])
  })
})
