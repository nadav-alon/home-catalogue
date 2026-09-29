import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/preact'
import { ScannerDialog } from './ScannerDialog.tsx'

const track = { stop: vi.fn() }
const stream = { getTracks: () => [track] }
let detected: string[][]

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  })
  HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve())
  track.stop.mockClear()
  detected = []
  vi.stubGlobal(
    'BarcodeDetector',
    class {
      detect = vi.fn(async () => (detected.shift() ?? []).map((rawValue) => ({ rawValue })))
    },
  )
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => stream) },
  })
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await new Promise((resolve) => setTimeout(resolve, 20))
  history.replaceState(null, '')
})

describe('ScannerDialog', () => {
  it('opens the rear camera', async () => {
    render(<ScannerDialog open onScan={() => {}} onClose={() => {}} />)
    await waitFor(() =>
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ video: { facingMode: 'environment' } }),
    )
  })

  it('returns the first value that is a Barcode, then releases the camera', async () => {
    detected = [[], ['not a gtin', '12345'], ['4006381333931', '12345678']]
    const onScan = vi.fn()
    render(<ScannerDialog open onScan={onScan} onClose={() => {}} />)
    await waitFor(() => expect(onScan).toHaveBeenCalledWith('4006381333931'))
    expect(onScan).toHaveBeenCalledOnce()
    expect(track.stop).toHaveBeenCalled()
  })
})
