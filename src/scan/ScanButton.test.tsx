import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/preact'
import { ScanButton } from './ScanButton.tsx'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ScanButton', () => {
  it('is hidden when BarcodeDetector is unavailable', () => {
    render(<ScanButton onClick={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Scan barcode' })).toBeNull()
  })

  it('is shown when BarcodeDetector is available, and asks to scan when pressed', () => {
    vi.stubGlobal('BarcodeDetector', class {})
    const onClick = vi.fn()
    render(<ScanButton onClick={onClick} />)
    fireEvent.click(screen.getByRole('button', { name: 'Scan barcode' }))
    expect(onClick).toHaveBeenCalledOnce()
  })
})
