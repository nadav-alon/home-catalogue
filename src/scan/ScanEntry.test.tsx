import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/preact'
import { TopAppBar } from '../shell/TopAppBar.tsx'
import { ScanEntry } from './ScanEntry.tsx'

const track = { stop: vi.fn() }
let getUserMedia: ReturnType<typeof vi.fn>

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  })
  HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve())
  vi.stubGlobal(
    'BarcodeDetector',
    class {
      detect = async () => [{ rawValue: '4006381333931' }]
    },
  )
  getUserMedia = vi.fn(async () => ({ getTracks: () => [track] }))
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await new Promise((resolve) => setTimeout(resolve, 20))
  history.replaceState(null, '')
})

function renderEntry(onScan = vi.fn()) {
  render(
    <TopAppBar title="Items">
      <ScanEntry onScan={onScan} />
    </TopAppBar>,
  )
  return onScan
}

describe('ScanEntry', () => {
  it('puts the scan icon in the top app bar', () => {
    renderEntry()
    expect(within(screen.getByRole('banner')).getByRole('button', { name: 'Scan barcode' })).toBeInTheDocument()
  })

  it('hands on the scanned barcode and closes the dialog', async () => {
    const onScan = renderEntry()
    fireEvent.click(screen.getByRole('button', { name: 'Scan barcode' }))
    await waitFor(() => expect(onScan).toHaveBeenCalledWith('4006381333931'))
    await waitFor(() => expect(document.querySelector('dialog')).not.toHaveAttribute('open'))
  })

  it('closes with "Camera access needed to scan" when camera access is denied', async () => {
    getUserMedia.mockRejectedValueOnce(new DOMException('Permission denied', 'NotAllowedError'))
    const onScan = renderEntry()
    fireEvent.click(screen.getByRole('button', { name: 'Scan barcode' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Camera access needed to scan')
    await waitFor(() => expect(document.querySelector('dialog')).not.toHaveAttribute('open'))
    expect(onScan).not.toHaveBeenCalled()
  })
})
