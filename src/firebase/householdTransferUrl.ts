import { deviceTransferUrl } from 'data-platform/client'
import type { FirebaseWebConfig } from 'data-platform/client'

/** The link that sets another device up with this household: the current page with `config` in its `#config=` fragment. The Add-device QR code and the invite share message both carry it. */
export function householdTransferUrl(config: FirebaseWebConfig): string {
  return deviceTransferUrl(location.href, config)
}
