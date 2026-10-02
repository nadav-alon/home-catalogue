import { useEffect, useState } from 'preact/hooks'
import QRCode from 'qrcode'
import { deviceTransferUrl } from './deviceTransfer.ts'
import type { FirebaseWebConfig } from './webConfig.ts'
import './DeviceTransferQrCode.css'

/** The blank border, in modules, a QR code needs around it to scan. */
const QUIET_ZONE_MODULES = 4

export interface DeviceTransferQrCodeProps {
  config: FirebaseWebConfig
  /** What the QR code is described as to assistive technology. */
  label: string
  /** Called once the QR code is on screen, so a caller can bring it into view at its final size. */
  onRendered?: () => void
}

/** The device-transfer link for `config` as a QR code, for another device to scan; renders nothing until it is generated. */
export function DeviceTransferQrCode({ config, label, onRendered }: DeviceTransferQrCodeProps) {
  const [svg, setSvg] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setSvg(null)
    setFailed(false)
    QRCode.toString(deviceTransferUrl(config), { type: 'svg', margin: QUIET_ZONE_MODULES }).then(
      (result) => !cancelled && setSvg(result),
      () => !cancelled && setFailed(true),
    )
    return () => {
      cancelled = true
    }
  }, [config])

  useEffect(() => {
    if (svg !== null) onRendered?.()
  }, [svg])

  if (failed) return <p role="alert">Could not generate the QR code.</p>
  if (svg === null) return null
  return <div className="device-transfer-qr-code" role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: svg }} />
}
