import { IconButton } from '../ui/IconButton.tsx'
import { nativeBarcodeDetector } from './barcodeDetector.ts'
import ScanIcon from '~icons/material-symbols/barcode-scanner'

export interface ScanButtonProps {
  onClick: () => void
}

/** The icon that starts a scan; absent where the browser has no `BarcodeDetector` to read one with. */
export function ScanButton({ onClick }: ScanButtonProps) {
  if (nativeBarcodeDetector() === undefined) return null
  return <IconButton symbol={ScanIcon} label="Scan barcode" onClick={onClick} />
}
