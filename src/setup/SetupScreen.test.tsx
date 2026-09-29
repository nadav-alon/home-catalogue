import { fireEvent, render, screen } from '@testing-library/preact'
import { describe, expect, it, vi } from 'vitest'
import { SetupScreen } from './SetupScreen.tsx'

const validConfig = {
  apiKey: 'AIzaSyDOCAbC123dEf456GhI789jKl012-MnO',
  authDomain: 'household.firebaseapp.com',
  projectId: 'household',
  storageBucket: 'household.appspot.com',
  messagingSenderId: '123456789',
  appId: '1:123456789:web:abcdef',
}

describe('SetupScreen', () => {
  it('rejects text with no config in it, with a message, without calling onConfigured', () => {
    const onConfigured = vi.fn()
    render(<SetupScreen onConfigured={onConfigured} />)

    fireEvent.input(screen.getByLabelText('Firebase web config'), { target: { value: 'not json' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(onConfigured).not.toHaveBeenCalled()
  })

  it('rejects an incomplete config with a message, without calling onConfigured', () => {
    const onConfigured = vi.fn()
    render(<SetupScreen onConfigured={onConfigured} />)

    fireEvent.input(screen.getByLabelText('Firebase web config'), {
      target: { value: JSON.stringify({ apiKey: 'only-this-field' }) },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(onConfigured).not.toHaveBeenCalled()
  })

  it('calls onConfigured with the parsed config once it is valid', () => {
    const onConfigured = vi.fn()
    render(<SetupScreen onConfigured={onConfigured} />)

    fireEvent.input(screen.getByLabelText('Firebase web config'), {
      target: { value: JSON.stringify(validConfig) },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onConfigured).toHaveBeenCalledWith(validConfig)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('calls onConfigured with the parsed config from the Firebase console snippet', () => {
    const onConfigured = vi.fn()
    render(<SetupScreen onConfigured={onConfigured} />)

    const snippet = `
      // Import the functions you need from the SDKs you need
      import { initializeApp } from "firebase/app";
      // Your web app's Firebase configuration
      const firebaseConfig = {
        apiKey: "${validConfig.apiKey}",
        authDomain: "${validConfig.authDomain}",
        projectId: "${validConfig.projectId}",
        storageBucket: "${validConfig.storageBucket}",
        messagingSenderId: "${validConfig.messagingSenderId}",
        appId: "${validConfig.appId}"
      };

      const app = initializeApp(firebaseConfig);
    `
    fireEvent.input(screen.getByLabelText('Firebase web config'), { target: { value: snippet } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onConfigured).toHaveBeenCalledWith(validConfig)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows an initial error, e.g. from a failed device transfer link', () => {
    render(<SetupScreen onConfigured={vi.fn()} initialError="That device transfer link is truncated or corrupted." />)

    expect(screen.getByRole('alert')).toHaveTextContent('That device transfer link is truncated or corrupted.')
  })

  it('links to the platform household setup doc', () => {
    render(<SetupScreen onConfigured={vi.fn()} />)

    expect(screen.getByRole('link', { name: 'household setup guide' })).toHaveAttribute(
      'href',
      'https://github.com/nadav-alon/data-platform/blob/main/docs/household-setup.md',
    )
  })
})

describe('SetupScreen styling', () => {
  it('is a card under the app name with no navigation, using primitives for the field and button', () => {
    render(<SetupScreen onConfigured={vi.fn()} />)

    expect(screen.getByText('Home Catalogue')).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Firebase web config')).toHaveClass('ui-field__control')
    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('ui-button')
  })
})
