import { useEffect, useState } from 'preact/hooks'
import type { core } from 'data-platform'
import { TopAppBarActions } from '../shell/TopAppBar.tsx'
import { ScanButton } from './ScanButton.tsx'
import { CAMERA_DENIED_MESSAGE, CAMERA_UNAVAILABLE_MESSAGE, ScannerDialog } from './ScannerDialog.tsx'

export interface ScanEntryProps {
  onScan: (barcode: core.Barcode) => void
}

/** The Items screen's way into scanning: the icon in the top app bar, the dialog it opens, and why scanning failed. */
export function ScanEntry({ onScan }: ScanEntryProps) {
  const [open, setOpen] = useState(false)
  const [failure, setFailure] = useState<typeof CAMERA_DENIED_MESSAGE | typeof CAMERA_UNAVAILABLE_MESSAGE>()
  const [scanned, setScanned] = useState<core.Barcode>()
  // Handed on from an effect, which runs after the scanner Dialog's layout-effect cleanup has issued its history pop, so a
  // navigation in `onScan` finds that pop pending instead of racing it.
  useEffect(() => {
    if (scanned === undefined) return
    setScanned(undefined)
    onScan(scanned)
  }, [scanned])
  return (
    <>
      <TopAppBarActions>
        <ScanButton
          onClick={() => {
            setFailure(undefined)
            setOpen(true)
          }}
        />
      </TopAppBarActions>
      <ScannerDialog
        open={open}
        onScan={(barcode) => {
          setOpen(false)
          setScanned(barcode)
        }}
        onDenied={() => {
          setOpen(false)
          setFailure(CAMERA_DENIED_MESSAGE)
        }}
        onUnavailable={() => {
          setOpen(false)
          setFailure(CAMERA_UNAVAILABLE_MESSAGE)
        }}
        onClose={() => setOpen(false)}
      />
      {failure !== undefined && <p role="alert">{failure}</p>}
    </>
  )
}
