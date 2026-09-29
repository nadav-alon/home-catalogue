import { fireEvent, render, screen } from '@testing-library/preact'
import { describe, expect, it } from 'vitest'
import { AddDeviceQrCode } from './AddDeviceQrCode.tsx'
import { firebaseWebConfig } from '../firebase/webConfig.ts'

const config = firebaseWebConfig({
  apiKey: 'AIzaSyDOCAbC123dEf456GhI789jKl012-MnO',
  authDomain: 'household.firebaseapp.com',
  projectId: 'household',
  storageBucket: 'household.appspot.com',
  messagingSenderId: '123456789',
  appId: '1:123456789:web:abcdef',
})

describe('AddDeviceQrCode', () => {
  it('offers an action to show the QR code, hidden until then', () => {
    render(<AddDeviceQrCode config={config} />)

    expect(screen.getByRole('heading', { name: 'Add a device' })).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('shows a QR code once the action is used', async () => {
    render(<AddDeviceQrCode config={config} />)

    fireEvent.click(screen.getByRole('button', { name: 'Show QR code' }))

    const qrCode = await screen.findByRole('img')
    expect(qrCode.innerHTML).toContain('<svg')
  })
})
