import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { Dialog } from './Dialog.tsx'
import { readFileSync } from 'node:fs'
import { mediaBlock, tokenUsage } from '../testing/css.ts'
import { stubModalDialog } from '../testing/dialog.ts'

beforeEach(stubModalDialog)

afterEach(async () => {
  cleanup()
  await new Promise((resolve) => setTimeout(resolve, 20))
  history.replaceState(null, '')
})

type Box = { left: number; top: number; right: number; bottom: number }

/** Replaces the dialog's measured box, which jsdom reports as empty. */
function stubBox(dialog: HTMLElement, box: Box) {
  dialog.getBoundingClientRect = () => ({
    ...box,
    x: box.left,
    y: box.top,
    width: box.right - box.left,
    height: box.bottom - box.top,
    toJSON: () => ({}),
  })
}

// Click coordinates in the tests below are positions relative to this box.
const box: Box = { left: 100, top: 100, right: 300, bottom: 300 }

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

  it('asks once to close when the backdrop is tapped', () => {
    const onClose = vi.fn()
    render(
      <Dialog open title="New item" onClose={onClose}>
        x
      </Dialog>,
    )
    const dialog = screen.getByRole('dialog')
    stubBox(dialog, box)
    fireEvent.mouseDown(dialog, { clientX: 50, clientY: 200 })
    fireEvent.click(dialog, { clientX: 50, clientY: 200 })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not ask to close when a press inside the box is released on the backdrop', () => {
    const onClose = vi.fn()
    render(
      <Dialog open title="New item" onClose={onClose}>
        <input aria-label="Name" />
      </Dialog>,
    )
    const dialog = screen.getByRole('dialog')
    stubBox(dialog, box)
    fireEvent.mouseDown(screen.getByLabelText('Name'), { clientX: 200, clientY: 200 })
    fireEvent.click(dialog, { clientX: 50, clientY: 200 })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not ask to close when the dialog padding is tapped', () => {
    const onClose = vi.fn()
    render(
      <Dialog open title="New item" onClose={onClose}>
        x
      </Dialog>,
    )
    const dialog = screen.getByRole('dialog')
    stubBox(dialog, box)
    fireEvent.mouseDown(dialog, { clientX: 105, clientY: 105 })
    fireEvent.click(dialog, { clientX: 105, clientY: 105 })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not ask to close when content inside the dialog is tapped', () => {
    const onClose = vi.fn()
    render(
      <Dialog open title="New item" onClose={onClose}>
        <button type="button">Save</button>
      </Dialog>,
    )
    stubBox(screen.getByRole('dialog'), box)
    const save = screen.getByRole('button', { name: 'Save' })
    fireEvent.mouseDown(save, { clientX: 200, clientY: 200 })
    fireEvent.click(save, { clientX: 200, clientY: 200 })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not ask to close when a full-screen dialog is tapped at its edge', () => {
    const onClose = vi.fn()
    render(
      <Dialog open title="New item" onClose={onClose}>
        x
      </Dialog>,
    )
    const dialog = screen.getByRole('dialog')
    stubBox(dialog, { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight })
    fireEvent.mouseDown(dialog, { clientX: 0, clientY: 0 })
    fireEvent.click(dialog, { clientX: 0, clientY: 0 })
    fireEvent.mouseDown(dialog, { clientX: window.innerWidth, clientY: window.innerHeight })
    fireEvent.click(dialog, { clientX: window.innerWidth, clientY: window.innerHeight })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('has no Close button unless closable', () => {
    render(
      <Dialog open title="New item" onClose={() => {}}>
        x
      </Dialog>,
    )
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
  })

  it('asks once to close from the Close button when closable', () => {
    const onClose = vi.fn()
    render(
      <Dialog open closable title="New item" onClose={onClose}>
        x
      </Dialog>,
    )
    const close = screen.getByRole('button', { name: 'Close' })
    expect(close.parentElement).toBe(screen.getByRole('heading', { name: 'New item' }).parentElement)
    fireEvent.click(close)
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

  it('is as tall as its content from 600px up, capped at the viewport', () => {
    const wideBlock = mediaBlock('src/ui/Dialog.css', '(min-width: 600px)')
    expect(wideBlock).not.toBe('')
    expect(wideBlock).toMatch(/(^|[\s;{])height: fit-content/)
    expect(wideBlock).not.toMatch(/(^|[\s;{])height: auto/)
    expect(wideBlock).toMatch(/max-height: calc\(100% - var\(--md-sys-spacing-8\)\)/)
  })

  it('is styled only from defined tokens', () => {
    const { used, undefinedTokens } = tokenUsage('src/ui/Dialog.css')
    expect(used.length).toBeGreaterThan(0)
    expect(undefinedTokens).toEqual([])
  })

  describe('holding unsaved edits', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })
    const renderDirty = (onClose: () => void) =>
      render(
        <Dialog open closable hasUnsavedEdits title="New item" onClose={onClose}>
          <input defaultValue="typed" aria-label="Name" />
        </Dialog>,
      )
    const closers: Record<string, () => void> = {
      Escape: () => fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true })),
      'a backdrop tap': () => {
        const dialog = screen.getByRole('dialog')
        stubBox(dialog, box)
        fireEvent.mouseDown(dialog, { clientX: 50, clientY: 200 })
        fireEvent.click(dialog, { clientX: 50, clientY: 200 })
      },
      'the Close button': () => fireEvent.click(screen.getByRole('button', { name: 'Close' })),
    }

    for (const [name, close] of Object.entries(closers)) {
      it(`asks to confirm before ${name} closes it, and stays open untouched when declined`, () => {
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
        const onClose = vi.fn()
        renderDirty(onClose)
        close()
        expect(confirmSpy).toHaveBeenCalledOnce()
        expect(onClose).not.toHaveBeenCalled()
        expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('typed')
      })

      it(`closes on ${name} once the discard is confirmed`, () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true)
        const onClose = vi.fn()
        renderDirty(onClose)
        close()
        expect(onClose).toHaveBeenCalledOnce()
      })

      it(`closes at once on ${name} when not holding unsaved edits`, () => {
        const confirmSpy = vi.spyOn(window, 'confirm')
        const onClose = vi.fn()
        render(
          <Dialog open closable title="New item" onClose={onClose}>
            x
          </Dialog>,
        )
        close()
        expect(confirmSpy).not.toHaveBeenCalled()
        expect(onClose).toHaveBeenCalledOnce()
      })
    }

    it('asks to confirm when the browser closes it uncancelably, and reopens it when declined', () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
      const onClose = vi.fn()
      renderDirty(onClose)
      const dialog = screen.getByRole('dialog') as HTMLDialogElement
      fireEvent(dialog, new Event('cancel', { cancelable: false }))
      dialog.close()
      expect(confirmSpy).toHaveBeenCalledOnce()
      expect(onClose).not.toHaveBeenCalled()
      expect(dialog.open).toBe(true)
      expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('typed')
    })

    it('closes when the browser closes it uncancelably and the discard is confirmed', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      const onClose = vi.fn()
      renderDirty(onClose)
      screen.getByRole<HTMLDialogElement>('dialog').close()
      expect(onClose).toHaveBeenCalledOnce()
    })

    const back = () =>
      new Promise<void>((resolve) => {
        window.addEventListener('popstate', () => resolve(), { once: true })
        history.back()
      })

    it('asks to confirm on browser back, and a declined back leaves the dialog open with its entry restored', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
      const onClose = vi.fn()
      renderDirty(onClose)
      await back()
      expect(confirmSpy).toHaveBeenCalledOnce()
      expect(onClose).not.toHaveBeenCalled()
      expect(history.state).toMatchObject({ 'ui-dialog': expect.any(String) })
      expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('typed')
      confirmSpy.mockReturnValue(true)
      await back()
      expect(confirmSpy).toHaveBeenCalledTimes(2)
      expect(onClose).toHaveBeenCalledOnce()
    })
  })
})
