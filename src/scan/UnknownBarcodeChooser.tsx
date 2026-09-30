import type { core } from 'data-platform'
import { Button } from '../ui/Button.tsx'
import { Dialog } from '../ui/Dialog.tsx'

export interface UnknownBarcodeChooserProps {
  /** The scanned Barcode no Item carries; the chooser is closed while there is none. */
  barcode: core.Barcode | undefined
  onClose: () => void
}

/** What to do with a scanned Barcode no Item carries yet. */
export function UnknownBarcodeChooser({ barcode, onClose }: UnknownBarcodeChooserProps) {
  return (
    <Dialog open={barcode !== undefined} title="Unknown barcode" onClose={onClose}>
      {barcode !== undefined && (
        <>
          <p>No Item carries {barcode}.</p>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
        </>
      )}
    </Dialog>
  )
}
