import { useEffect, useRef } from 'preact/hooks'
import { core } from 'data-platform'
import { Dialog } from '../ui/Dialog.tsx'
import { IconButton } from '../ui/IconButton.tsx'
import { nativeBarcodeDetector, type BarcodeFormat } from './barcodeDetector.ts'
import './ScannerDialog.css'
import CloseIcon from '~icons/material-symbols/close'

export interface ScannerDialogProps {
  open: boolean
  /** Called once with the first detected value that is a Barcode; the camera is already released. */
  onScan: (barcode: core.Barcode) => void
  /** Called instead of `onScan` when the Member refuses camera access; the caller closes the dialog. A detector failure calls `onClose`. */
  onDenied: () => void
  /** Called instead of `onScan` when the camera cannot be opened for any reason other than denial; the caller closes the dialog. */
  onUnavailable: () => void
  onClose: () => void
}

export const CAMERA_DENIED_MESSAGE = 'Camera access needed to scan'
export const CAMERA_UNAVAILABLE_MESSAGE = 'Camera unavailable'

/** The symbologies a GTIN is printed in: EAN-8, UPC-A, EAN-13 and ITF-14. */
const GTIN_FORMATS: BarcodeFormat[] = ['ean_8', 'upc_a', 'ean_13', 'itf']

const DETECT_INTERVAL_MS = 150

/**
 * A full-screen dialog showing the rear camera until it reads one Barcode. The camera is released
 * when a Barcode is read and whenever the dialog closes, whichever comes first.
 */
export function ScannerDialog({ open, onScan, onDenied, onUnavailable, onClose }: ScannerDialogProps) {
  return (
    <Dialog open={open} title="Scan barcode" class="scan-dialog" onClose={onClose}>
      <IconButton symbol={CloseIcon} label="Close" onClick={onClose} />
      {open && <CameraReader onScan={onScan} onDenied={onDenied} onUnavailable={onUnavailable} onClose={onClose} />}
    </Dialog>
  )
}

function CameraReader({
  onScan,
  onDenied,
  onUnavailable,
  onClose,
}: Pick<ScannerDialogProps, 'onScan' | 'onDenied' | 'onUnavailable' | 'onClose'>) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan
  const onDeniedRef = useRef(onDenied)
  onDeniedRef.current = onDenied
  const onUnavailableRef = useRef(onUnavailable)
  onUnavailableRef.current = onUnavailable
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

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
        if (stopped) return
        if (err instanceof DOMException && err.name === 'NotAllowedError') onDeniedRef.current()
        else onUnavailableRef.current()
        return
      }
      if (stopped) return release()
      try {
        video.srcObject = stream
        await video.play()
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
      } catch {
        if (stopped) return
        stopped = true
        release()
        onCloseRef.current()
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
