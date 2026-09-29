import { useEffect, useRef } from 'preact/hooks'
import { core } from 'data-platform'
import { Dialog } from '../ui/Dialog.tsx'
import { IconButton } from '../ui/IconButton.tsx'
import { nativeBarcodeDetector } from './barcodeDetector.ts'
import './ScannerDialog.css'
import CloseIcon from '~icons/material-symbols/close'

export interface ScannerDialogProps {
  open: boolean
  /** Called once with the first detected value that is a Barcode; the camera is already released. */
  onScan: (barcode: core.Barcode) => void
  /** Called instead of `onScan` when the Member refuses camera access; the caller closes the dialog. */
  onDenied: () => void
  onClose: () => void
}

export const CAMERA_DENIED_MESSAGE = 'Camera access needed to scan'

/** The symbologies a GTIN is printed in: EAN-8, UPC-A, EAN-13 and ITF-14. */
const GTIN_FORMATS = ['ean_8', 'upc_a', 'ean_13', 'itf']

const DETECT_INTERVAL_MS = 150

/**
 * A full-screen dialog showing the rear camera until it reads one Barcode. The camera is released
 * when a Barcode is read and whenever the dialog closes, whichever comes first.
 */
export function ScannerDialog({ open, onScan, onDenied, onClose }: ScannerDialogProps) {
  return (
    <Dialog open={open} title="Scan barcode" onClose={onClose}>
      <IconButton symbol={CloseIcon} label="Close" onClick={onClose} />
      {open && <CameraReader onScan={onScan} onDenied={onDenied} />}
    </Dialog>
  )
}

function CameraReader({ onScan, onDenied }: Pick<ScannerDialogProps, 'onScan' | 'onDenied'>) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan
  const onDeniedRef = useRef(onDenied)
  onDeniedRef.current = onDenied

  useEffect(() => {
    let stopped = false
    let stream: MediaStream | undefined
    const release = () => stream?.getTracks().forEach((track) => track.stop())

    async function read() {
      const Detector = nativeBarcodeDetector()
      const video = videoRef.current
      if (Detector === undefined || video === null) return
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'NotAllowedError')) throw err
        if (!stopped) onDeniedRef.current()
        return
      }
      if (stopped) return release()
      video.srcObject = stream
      void video.play()
      const detector = new Detector({ formats: GTIN_FORMATS })
      while (!stopped) {
        const found = (await detector.detect(video)).map((code) => code.rawValue).find(core.isBarcode)
        if (stopped) return
        if (found !== undefined) {
          stopped = true
          release()
          onScanRef.current(found)
          return
        }
        await new Promise((resolve) => setTimeout(resolve, DETECT_INTERVAL_MS))
      }
    }

    void read()
    return () => {
      stopped = true
      release()
    }
  }, [])

  return <video ref={videoRef} class="scan-video" muted playsInline />
}
