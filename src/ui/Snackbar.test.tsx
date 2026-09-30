import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { tokenUsage } from '../testing/css.ts'
import { SnackbarHost, resetSnackbar, showSnackbar } from './Snackbar.tsx'

afterEach(() => {
  resetSnackbar()
  cleanup()
  vi.useRealTimers()
})

describe('Snackbar', () => {
  it('shows a message from any screen in a status region', () => {
    render(<SnackbarHost />)
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    act(() => showSnackbar({ text: 'Deleted Bandages' }))
    expect(screen.getByRole('status')).toHaveTextContent('Deleted Bandages')
  })

  it('shows no button without an action', () => {
    render(<SnackbarHost />)
    act(() => showSnackbar({ text: 'Saved' }))
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('runs its action and disappears when the action is pressed', () => {
    const onAction = vi.fn()
    render(<SnackbarHost />)
    act(() => showSnackbar({ text: 'Deleted Bandages', action: { label: 'Undo', onAction } }))
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(onAction).toHaveBeenCalledOnce()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('disappears after about 6 seconds', () => {
    vi.useFakeTimers()
    render(<SnackbarHost />)
    act(() => showSnackbar({ text: 'Saved' }))
    act(() => {
      vi.advanceTimersByTime(5900)
    })
    expect(screen.getByRole('status')).toHaveTextContent('Saved')
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('replaces the current message with a second one, which gets its own full time', () => {
    vi.useFakeTimers()
    render(<SnackbarHost />)
    act(() => showSnackbar({ text: 'First', action: { label: 'Undo', onAction: () => {} } }))
    act(() => {
      vi.advanceTimersByTime(4000)
    })
    act(() => showSnackbar({ text: 'Second' }))
    expect(screen.getByRole('status')).toHaveTextContent('Second')
    expect(screen.getByRole('status')).not.toHaveTextContent('First')
    expect(screen.queryByRole('button')).toBeNull()
    act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(screen.getByRole('status')).toHaveTextContent('Second')
    act(() => {
      vi.advanceTimersByTime(2100)
    })
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('stays up while the pointer is over it, then gets a fresh full time once the pointer leaves', () => {
    vi.useFakeTimers()
    render(<SnackbarHost />)
    act(() => showSnackbar({ text: 'Saved' }))
    const status = screen.getByRole('status')
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    fireEvent.pointerEnter(status)
    act(() => {
      vi.advanceTimersByTime(60000)
    })
    expect(status).toHaveTextContent('Saved')
    fireEvent.pointerLeave(status)
    act(() => {
      vi.advanceTimersByTime(5900)
    })
    expect(status).toHaveTextContent('Saved')
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(status).toBeEmptyDOMElement()
  })

  it('stays up while focus is inside it, then gets a fresh full time once focus leaves', () => {
    vi.useFakeTimers()
    render(<SnackbarHost />)
    act(() => showSnackbar({ text: 'Deleted Bandages', action: { label: 'Undo', onAction: () => {} } }))
    const status = screen.getByRole('status')
    const undo = screen.getByRole('button', { name: 'Undo' })
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    act(() => undo.focus())
    act(() => {
      vi.advanceTimersByTime(60000)
    })
    expect(status).toHaveTextContent('Deleted Bandages')
    act(() => undo.blur())
    act(() => {
      vi.advanceTimersByTime(5900)
    })
    expect(status).toHaveTextContent('Deleted Bandages')
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(status).toBeEmptyDOMElement()
  })

  it('stays up until both the pointer and focus have left', () => {
    vi.useFakeTimers()
    render(<SnackbarHost />)
    act(() => showSnackbar({ text: 'Deleted Bandages', action: { label: 'Undo', onAction: () => {} } }))
    const status = screen.getByRole('status')
    const undo = screen.getByRole('button', { name: 'Undo' })
    fireEvent.pointerEnter(status)
    act(() => undo.focus())
    act(() => undo.blur())
    act(() => {
      vi.advanceTimersByTime(60000)
    })
    expect(status).toHaveTextContent('Deleted Bandages')
    fireEvent.pointerLeave(status)
    act(() => {
      vi.advanceTimersByTime(6100)
    })
    expect(status).toBeEmptyDOMElement()
  })

  it('is styled only from defined tokens', () => {
    const { used, undefinedTokens } = tokenUsage('src/ui/Snackbar.css')
    expect(used.length).toBeGreaterThan(0)
    expect(undefinedTokens).toEqual([])
  })
})
