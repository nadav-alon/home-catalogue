import { useState } from 'preact/hooks'
import type { core } from 'data-platform'
import { TopAppBarActions } from '../shell/TopAppBar.tsx'
import { ScanButton } from './ScanButton.tsx'
import { CAMERA_DENIED_MESSAGE, ScannerDialog } from './ScannerDialog.tsx'

export interface ScanEntryProps {
  onScan: (barcode: core.Barcode) => void
}

/** The Items screen's way into scanning: the icon in the top app bar, the dialog it opens, and why a scan could not start. */
export function ScanEntry({ onScan }: ScanEntryProps) {
  const [open, setOpen] = useState(false)
  const [denied, setDenied] = useState(false)
  return (
    <>
      <TopAppBarActions>
        <ScanButton
          onClick={() => {
            setDenied(false)
            setOpen(true)
          }}
        />
      </TopAppBarActions>
      <ScannerDialog
        open={open}
        onScan={(barcode) => {
          setOpen(false)
          onScan(barcode)
        }}
        onDenied={() => {
          setOpen(false)
          setDenied(true)
        }}
        onClose={() => setOpen(false)}
      />
      {denied && <p role="alert">{CAMERA_DENIED_MESSAGE}</p>}
    </>
  )
}
