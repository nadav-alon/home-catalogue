import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/preact'
import { DeviceTransferQrCode } from './DeviceTransferQrCode.tsx'
import { read, tokenUsage } from '../testing/css.ts'
import { firebaseWebConfig } from './webConfig.ts'

const config = firebaseWebConfig({
  apiKey: 'AIzaSyDOCAbC123dEf456GhI789jKl012-MnO',
  authDomain: 'household.firebaseapp.com',
  projectId: 'household',
  storageBucket: 'household.appspot.com',
  messagingSenderId: '123456789',
  appId: '1:123456789:web:abcdef',
})

describe('DeviceTransferQrCode', () => {
  it('caps the code at 15rem so the control under it stays on a phone screen', async () => {
    render(<DeviceTransferQrCode config={config} label="Scan me" />)
    const code = await screen.findByRole('img', { name: 'Scan me' })
    expect(code).toHaveClass('device-transfer-qr-code')
    expect(read('src/firebase/DeviceTransferQrCode.css')).toMatch(/\.device-transfer-qr-code\s*\{[^}]*max-width:\s*15rem/)
  })

  it('keeps a four-module quiet zone around the code', async () => {
    render(<DeviceTransferQrCode config={config} label="Scan me" />)
    const svg = (await screen.findByRole('img', { name: 'Scan me' })).querySelector('svg')
    expect(svg?.getAttribute('viewBox')).toMatch(/^0 0 (\d+) \1$/)
    expect(svg?.querySelector('path[stroke]')?.getAttribute('d')).toMatch(/^M4 /)
  })

  it('is styled only from defined tokens', () => {
    expect(tokenUsage('src/firebase/DeviceTransferQrCode.css').undefinedTokens).toEqual([])
  })
})
