import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { SnackbarHost, showSnackbar } from './Snackbar.tsx'

afterEach(() => {
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
})
