import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/preact'
import { DeviceTransferQrCode } from './DeviceTransferQrCode.tsx'
import { read, tokenUsage } from '../testing/css.ts'
import type { FirebaseWebConfig } from './webConfig.ts'

const config = { apiKey: 'k', authDomain: 'a', projectId: 'p', appId: 'i' } as unknown as FirebaseWebConfig

describe('DeviceTransferQrCode', () => {
  it('caps the code at 15rem so the control under it stays on a phone screen', async () => {
    render(<DeviceTransferQrCode config={config} label="Scan me" />)
    const code = await screen.findByRole('img', { name: 'Scan me' })
    expect(code).toHaveClass('device-transfer-qr-code')
    const css = read('src/firebase/DeviceTransferQrCode.css').replace(/\s+/g, ' ')
    expect(css).toContain('.device-transfer-qr-code { width: 100%; max-width: 15rem; }')
  })

  it('keeps the quiet zone by leaving the generated SVG unmodified', async () => {
    render(<DeviceTransferQrCode config={config} label="Scan me" />)
    const svg = (await screen.findByRole('img', { name: 'Scan me' })).querySelector('svg')
    expect(svg?.getAttribute('viewBox')).toMatch(/^0 0 (\d+) \1$/)
    expect(svg?.querySelector('path[stroke]')?.getAttribute('d')).toMatch(/^M(?!0 )/)
  })

  it('is styled only from defined tokens', () => {
    expect(tokenUsage('src/firebase/DeviceTransferQrCode.css').undefinedTokens).toEqual([])
  })
})
