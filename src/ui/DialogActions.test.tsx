import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/preact'
import { DialogActions } from './DialogActions.tsx'
import { declaration, mediaBlock, read, tokenUsage } from '../testing/css.ts'

describe('DialogActions', () => {
  it('keeps the destructive action out of the group the confirm actions share', () => {
    render(
      <DialogActions destructive={<button type="button">Delete</button>}>
        <button type="button">Cancel</button>
        <button type="submit">Save</button>
      </DialogActions>,
    )

    const del = screen.getByRole('button', { name: 'Delete' })
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    expect(cancel.parentElement).toBe(screen.getByRole('button', { name: 'Save' }).parentElement)
    expect(del.parentElement).not.toBe(cancel.parentElement)
    expect(del.parentElement).toHaveClass('ui-dialog-actions__destructive')
  })

  it('renders no destructive group without an destructive action', () => {
    const { container } = render(
      <DialogActions>
        <button type="button">Cancel</button>
      </DialogActions>,
    )

    expect(container.querySelector('.ui-dialog-actions__destructive')).toBeNull()
  })

  it('colours a text Button in the destructive slot from the error token, including on hover, from Button.css', () => {
    const slotTextButton = '.ui-button--text:is(.ui-button--destructive, .ui-dialog-actions__destructive *)'
    const escaped = slotTextButton.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    expect(declaration('src/ui/Button.css', slotTextButton, 'color')).toBe('var(--md-sys-color-error)')
    expect(mediaBlock('src/ui/Button.css', '(hover: hover)')).toMatch(
      new RegExp(`${escaped}:hover:not\\(:disabled\\)\\s*{[^}]*var\\(--md-sys-color-error\\)`),
    )
    expect(read('src/ui/DialogActions.css')).not.toContain('--md-sys-color-error')
  })

  it('lays out the row right-aligned with Delete at the start', () => {
    const css = read('src/ui/DialogActions.css')
    expect(css).toMatch(/\.ui-dialog-actions\s*\{[^}]*justify-content:\s*flex-end/)
    expect(css).toMatch(/\.ui-dialog-actions\s*\{[^}]*margin-top:\s*var\(--md-sys-spacing-6\)/)
    expect(css).toMatch(/__destructive\s*\{\s*margin-right:\s*auto/)
  })

  it('stacks the form with the gap the Item dialog has, so the space above the row is 2.5rem', () => {
    const css = read('src/ui/DialogActions.css')
    expect(css).toMatch(/\.ui-dialog-form\s*\{[^}]*flex-direction:\s*column[^}]*gap:\s*var\(--md-sys-spacing-4\)/)
    const { used, undefinedTokens } = tokenUsage('src/ui/DialogActions.css')
    expect(used.length).toBeGreaterThan(0)
    expect(undefinedTokens).toEqual([])
  })
})
