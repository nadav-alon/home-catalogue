import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/preact'
import { Dialog } from './Dialog.tsx'
import { readFileSync } from 'node:fs'
import { tokenUsage } from './cssTokens.ts'

/** jsdom has no modal dialog; stand in for the browser's open/close bookkeeping. */
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  })
})

afterEach(() => {
  history.replaceState(null, '')
})

describe('Dialog', () => {
  it('is a native dialog opened modally, named by its title', () => {
    render(
      <Dialog open title="New item" onClose={() => {}}>
        <p>Body</p>
      </Dialog>,
    )
    const dialog = screen.getByRole('dialog', { name: 'New item' })
    expect(dialog.tagName).toBe('DIALOG')
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledOnce()
    expect(dialog).toHaveTextContent('Body')
  })

  it('stays closed until open', () => {
    const { rerender } = render(
      <Dialog open={false} title="New item" onClose={() => {}}>
        x
      </Dialog>,
    )
    expect(HTMLDialogElement.prototype.showModal).not.toHaveBeenCalled()
    rerender(
      <Dialog open title="New item" onClose={() => {}}>
        x
      </Dialog>,
    )
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledOnce()
  })

  it('asks to close on Escape, leaving the open state to the caller', () => {
    const onClose = vi.fn()
    render(
      <Dialog open title="New item" onClose={onClose}>
        x
      </Dialog>,
    )
    const cancel = new Event('cancel', { cancelable: true })
    fireEvent(screen.getByRole('dialog'), cancel)
    expect(cancel.defaultPrevented).toBe(true)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('closes the native dialog when the caller closes it', () => {
    const { rerender } = render(
      <Dialog open title="New item" onClose={() => {}}>
        x
      </Dialog>,
    )
    rerender(
      <Dialog open={false} title="New item" onClose={() => {}}>
        x
      </Dialog>,
    )
    expect(HTMLDialogElement.prototype.close).toHaveBeenCalledOnce()
  })

  it('asks to close on browser back, which drops the entry opening pushed', () => {
    const onClose = vi.fn()
    const before = history.length
    render(
      <Dialog open title="New item" onClose={onClose}>
        x
      </Dialog>,
    )
    expect(history.length).toBe(before + 1)
    fireEvent(window, new PopStateEvent('popstate', { state: null }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('pops its history entry when closed by other means', () => {
    const back = vi.spyOn(history, 'back').mockImplementation(() => {})
    const { rerender } = render(
      <Dialog open title="New item" onClose={() => {}}>
        x
      </Dialog>,
    )
    rerender(
      <Dialog open={false} title="New item" onClose={() => {}}>
        x
      </Dialog>,
    )
    expect(back).toHaveBeenCalledOnce()
    back.mockRestore()
  })

  it('is full-screen below 600px and centred from 600px up', () => {
    const css = readFileSync('src/ui/Dialog.css', 'utf8')
    expect(css).toMatch(/@media \(min-width: 600px\)/)
    expect(css).toMatch(/\.ui-dialog\s*{[^}]*width: 100%[^}]*height: 100%/)
    expect(css).toMatch(/@media \(min-width: 600px\)\s*{[\s\S]*margin: auto/)
  })

  it('is styled only from defined tokens', () => {
    const { used, undefinedTokens } = tokenUsage('Dialog.css')
    expect(used.length).toBeGreaterThan(0)
    expect(undefinedTokens).toEqual([])
  })
})
