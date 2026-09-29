import { act, fireEvent, render, screen } from '@testing-library/preact'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WriteRejectionBanner } from './WriteRejectionBanner.tsx'
import { reportWriteRejection, resetWriteRejections } from './writeRejections.ts'

afterEach(() => {
  resetWriteRejections()
  vi.restoreAllMocks()
})

describe('WriteRejectionBanner', () => {
  it('shows nothing until a write is rejected', () => {
    render(<WriteRejectionBanner />)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('names each rejected write and logs the underlying error', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<WriteRejectionBanner />)

    const err = new Error('permission-denied')
    act(() => {
      reportWriteRejection('State change for Bandages', err)
      reportWriteRejection('new Shop', err)
    })

    const alerts = screen.getAllByRole('alert')
    expect(alerts[0]).toHaveTextContent('Could not save State change for Bandages')
    expect(alerts[1]).toHaveTextContent('Could not save new Shop')
    expect(consoleError).toHaveBeenCalledWith(expect.any(String), err)
  })

  it('dismisses one rejection without hiding the others', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<WriteRejectionBanner />)
    act(() => {
      reportWriteRejection('new Shop', new Error('x'))
      reportWriteRejection('new Category', new Error('x'))
    })

    fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss' })[0]!)

    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save new Category')
  })
})
