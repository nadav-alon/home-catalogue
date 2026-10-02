import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { ScannerDialog } from './ScannerDialog.tsx'

const track = { stop: vi.fn() }
const stream = { getTracks: () => [track] } as unknown as MediaStream
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
    render(<ScannerDialog open onScan={() => {}} onDenied={() => {}} onUnavailable={() => {}} onClose={() => {}} />)
    await waitFor(() =>
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ video: { facingMode: 'environment' } }),
    )
  })

  it('returns the first value that is a Barcode, then releases the camera', async () => {
    detected = [[], ['not a gtin', '12345'], ['4006381333931', '12345678']]
    const onScan = vi.fn()
    render(<ScannerDialog open onScan={onScan} onDenied={() => {}} onUnavailable={() => {}} onClose={() => {}} />)
    await waitFor(() => expect(onScan).toHaveBeenCalledWith('4006381333931'))
    expect(onScan).toHaveBeenCalledOnce()
    expect(track.stop).toHaveBeenCalled()
  })

  it('closes from ✕ without returning anything, and releases the camera once closed', async () => {
    const onScan = vi.fn()
    const onClose = vi.fn()
    const { rerender } = render(<ScannerDialog open onScan={onScan} onDenied={() => {}} onUnavailable={() => {}} onClose={onClose} />)
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled())
    const buttons = screen.getAllByRole('button', { name: 'Close' })
    expect(buttons).toHaveLength(1)
    fireEvent.click(buttons[0])
    expect(onClose).toHaveBeenCalledOnce()
    rerender(<ScannerDialog open={false} onScan={onScan} onDenied={() => {}} onUnavailable={() => {}} onClose={onClose} />)
    expect(track.stop).toHaveBeenCalled()
    expect(onScan).not.toHaveBeenCalled()
  })

  it('closes on browser back without returning anything', async () => {
    const onScan = vi.fn()
    const onClose = vi.fn()
    render(<ScannerDialog open onScan={onScan} onDenied={() => {}} onUnavailable={() => {}} onClose={onClose} />)
    await waitFor(() => expect(history.state).not.toBeNull())
    history.back()
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(onScan).not.toHaveBeenCalled()
  })

  it('releases a camera that was granted only after the dialog closed', async () => {
    let grant: (value: MediaStream) => void = () => {}
    vi.mocked(navigator.mediaDevices.getUserMedia).mockReturnValueOnce(
      new Promise((resolve) => (grant = resolve)),
    )
    const onScan = vi.fn()
    const { rerender } = render(<ScannerDialog open onScan={onScan} onDenied={() => {}} onUnavailable={() => {}} onClose={() => {}} />)
    rerender(<ScannerDialog open={false} onScan={onScan} onDenied={() => {}} onUnavailable={() => {}} onClose={() => {}} />)
    grant(stream)
    await waitFor(() => expect(track.stop).toHaveBeenCalled())
    expect(onScan).not.toHaveBeenCalled()
  })

  it('reports denied camera access instead of scanning', async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(
      new DOMException('Permission denied', 'NotAllowedError'),
    )
    const onScan = vi.fn()
    const onDenied = vi.fn()
    render(<ScannerDialog open onScan={onScan} onDenied={onDenied} onUnavailable={() => {}} onClose={() => {}} />)
    await waitFor(() => expect(onDenied).toHaveBeenCalledOnce())
    expect(onScan).not.toHaveBeenCalled()
  })

  it('reports the camera as unavailable instead of rethrowing when it cannot be opened for another reason', async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(new DOMException('No camera', 'NotFoundError'))
    const onDenied = vi.fn()
    const onUnavailable = vi.fn()
    render(<ScannerDialog open onScan={() => {}} onDenied={onDenied} onUnavailable={onUnavailable} onClose={() => {}} />)
    await waitFor(() => expect(onUnavailable).toHaveBeenCalledOnce())
    expect(onDenied).not.toHaveBeenCalled()
  })

  it('reports the camera as unavailable when navigator.mediaDevices is undefined', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined })
    const onDenied = vi.fn()
    const onUnavailable = vi.fn()
    render(<ScannerDialog open onScan={() => {}} onDenied={onDenied} onUnavailable={onUnavailable} onClose={() => {}} />)
    await waitFor(() => expect(onUnavailable).toHaveBeenCalledOnce())
    expect(onDenied).not.toHaveBeenCalled()
  })

  it('releases the camera and reports the camera unavailable when detection fails', async () => {
    vi.stubGlobal(
      'BarcodeDetector',
      class {
        detect = vi.fn(async () => {
          throw new DOMException('No frame', 'InvalidStateError')
        })
      },
    )
    const onUnavailable = vi.fn()
    render(<ScannerDialog open onScan={() => {}} onDenied={() => {}} onUnavailable={onUnavailable} onClose={() => {}} />)
    await waitFor(() => expect(onUnavailable).toHaveBeenCalledOnce())
    expect(track.stop).toHaveBeenCalled()
  })
})
