import { useEffect, useState } from 'preact/hooks'
import QRCode from 'qrcode'
import { deviceTransferUrl } from './deviceTransfer.ts'
import type { FirebaseWebConfig } from './webConfig.ts'

export interface DeviceTransferQrCodeProps {
  config: FirebaseWebConfig
  /** What the QR code is described as to assistive technology. */
  label: string
}

/** The device-transfer link for `config` as a QR code, for another device to scan; renders nothing until it is generated. */
export function DeviceTransferQrCode({ config, label }: DeviceTransferQrCodeProps) {
  const [svg, setSvg] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setSvg(null)
    setFailed(false)
    QRCode.toString(deviceTransferUrl(config), { type: 'svg' }).then(
      (result) => !cancelled && setSvg(result),
      () => !cancelled && setFailed(true),
    )
    return () => {
      cancelled = true
    }
  }, [config])

  if (failed) return <p role="alert">Could not generate the QR code.</p>
  if (svg === null) return null
  return <div role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: svg }} />
}
