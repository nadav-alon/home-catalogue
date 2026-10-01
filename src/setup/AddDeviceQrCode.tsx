import { useState } from 'preact/hooks'
import { DeviceTransferQrCode } from '../firebase/DeviceTransferQrCode.tsx'
import type { FirebaseWebConfig } from '../firebase/webConfig.ts'

export interface AddDeviceQrCodeProps {
  config: FirebaseWebConfig
}

/** Lets a signed-in device show a QR code that carries its stored Firebase config, for a new device to scan. */
export function AddDeviceQrCode({ config }: AddDeviceQrCodeProps) {
  const [shown, setShown] = useState(false)

  return (
    <section>
      <h2>Add a device</h2>
      <button type="button" onClick={() => setShown(true)}>
        Show QR code
      </button>
      {shown && <DeviceTransferQrCode config={config} label="Scan with the new device's camera to set it up" />}
    </section>
  )
}
