import { useState } from 'preact/hooks'
import QRCode from 'qrcode'
import { deviceTransferUrl } from '../firebase/deviceTransfer.ts'
import type { FirebaseWebConfig } from '../firebase/webConfig.ts'

export interface AddDeviceQrCodeProps {
  config: FirebaseWebConfig
}

/** Lets a signed-in device show a QR code that carries its stored Firebase config, for a new device to scan. */
export function AddDeviceQrCode({ config }: AddDeviceQrCodeProps) {
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleShow() {
    try {
      setSvg(await QRCode.toString(deviceTransferUrl(config), { type: 'svg' }))
      setError(null)
    } catch {
      setError('Could not generate the QR code.')
    }
  }

  return (
    <section>
      <h2>Add a device</h2>
      <button type="button" onClick={() => void handleShow()}>
        Show QR code
      </button>
      {error !== null && <p role="alert">{error}</p>}
      {svg !== null && (
        <div role="img" aria-label="Scan with the new device's camera to set it up" dangerouslySetInnerHTML={{ __html: svg }} />
      )}
    </section>
  )
}
