import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { Dialog } from './Dialog.tsx'
import { readFileSync } from 'node:fs'
import { tokenUsage } from '../testing/css.ts'

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

afterEach(async () => {
  cleanup()
  await new Promise((resolve) => setTimeout(resolve, 20))
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
    render(
      <Dialog open title="New item" onClose={onClose}>
        x
      </Dialog>,
    )
    expect(history.state).toMatchObject({ 'ui-dialog': expect.any(String) })
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
    fireEvent(window, new PopStateEvent('popstate', { state: null }))
  })

  it('asks to close when the browser closes the dialog itself', () => {
    const onClose = vi.fn()
    render(
      <Dialog open title="New item" onClose={onClose}>
        x
      </Dialog>,
    )
    fireEvent(screen.getByRole('dialog'), new Event('close'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not ask to close when the caller closed it', () => {
    const onClose = vi.fn()
    const { rerender } = render(
      <Dialog open title="New item" onClose={onClose}>
        x
      </Dialog>,
    )
    rerender(
      <Dialog open={false} title="New item" onClose={onClose}>
        x
      </Dialog>,
    )
    expect(onClose).not.toHaveBeenCalled()
  })

  it('leaves a history entry pushed by someone else in place when closed', () => {
    const back = vi.spyOn(history, 'back').mockImplementation(() => {})
    const { rerender } = render(
      <Dialog open title="New item" onClose={() => {}}>
        x
      </Dialog>,
    )
    history.pushState({ other: true }, '')
    rerender(
      <Dialog open={false} title="New item" onClose={() => {}}>
        x
      </Dialog>,
    )
    expect(back).not.toHaveBeenCalled()
    back.mockRestore()
  })

  it('keeps a dialog opened in the same tick as another closes open', async () => {
    const onCloseSecond = vi.fn()
    const pair = (first: boolean, second: boolean) => (
      <>
        <Dialog open={first} title="Edit" onClose={() => {}}>
          x
        </Dialog>
        <Dialog open={second} title="Confirm" onClose={onCloseSecond}>
          y
        </Dialog>
      </>
    )
    const { rerender } = render(pair(true, false))
    rerender(pair(false, true))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(onCloseSecond).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Confirm' })).toHaveAttribute('open')
    expect(history.state).toMatchObject({ 'ui-dialog': expect.any(String) })
  })

  it('is full-screen below 600px and centred from 600px up', () => {
    const css = readFileSync('src/ui/Dialog.css', 'utf8')
    expect(css).toMatch(/@media \(min-width: 600px\)/)
    expect(css).toMatch(/\.ui-dialog\s*{[^}]*width: 100%[^}]*height: 100%/)
    expect(css).toMatch(/@media \(min-width: 600px\)\s*{[\s\S]*margin: auto/)
  })

  it('is styled only from defined tokens', () => {
    const { used, undefinedTokens } = tokenUsage('src/ui/Dialog.css')
    expect(used.length).toBeGreaterThan(0)
    expect(undefinedTokens).toEqual([])
  })
})
