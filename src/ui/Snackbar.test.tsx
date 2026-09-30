import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/preact'
import { SnackbarHost, showSnackbar } from './Snackbar.tsx'

afterEach(cleanup)

describe('Snackbar', () => {
  it('shows a message from any screen in a status region', () => {
    render(<SnackbarHost />)
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    act(() => showSnackbar({ text: 'Deleted Bandages' }))
    expect(screen.getByRole('status')).toHaveTextContent('Deleted Bandages')
  })
})
