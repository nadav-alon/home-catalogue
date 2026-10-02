import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/preact'
import { DialogActions } from './DialogActions.tsx'
import { read, tokenUsage } from '../testing/css.ts'

describe('DialogActions', () => {
  it('keeps the apart action out of the group the confirm actions share', () => {
    render(
      <DialogActions apart={<button type="button">Delete</button>}>
        <button type="button">Cancel</button>
        <button type="submit">Save</button>
      </DialogActions>,
    )

    const del = screen.getByRole('button', { name: 'Delete' })
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    expect(cancel.parentElement).toBe(screen.getByRole('button', { name: 'Save' }).parentElement)
    expect(del.parentElement).not.toBe(cancel.parentElement)
    expect(del.parentElement).toHaveClass('ui-dialog-actions__apart')
  })

  it('renders no apart group without an apart action', () => {
    const { container } = render(
      <DialogActions>
        <button type="button">Cancel</button>
      </DialogActions>,
    )

    expect(container.querySelector('.ui-dialog-actions__apart')).toBeNull()
  })

  it('lays out like the Item dialog: right-aligned, Delete at the start, same gap above', () => {
    const css = read('src/ui/DialogActions.css')
    const item = read('src/catalogue/ItemDialog.css')
    for (const declaration of ['justify-content: flex-end', 'margin-top: var(--md-sys-spacing-6)', 'gap: var(--md-sys-spacing-6)']) {
      expect(css).toContain(declaration)
      expect(item).toContain(declaration)
    }
    expect(css).toMatch(/__apart\s*{\s*margin-right: auto/)
    const { used, undefinedTokens } = tokenUsage('src/ui/DialogActions.css')
    expect(used.length).toBeGreaterThan(0)
    expect(undefinedTokens).toEqual([])
  })
})
