import { deviceTransferUrl } from '../firebase/deviceTransfer.ts'
import type { FirebaseWebConfig } from '../firebase/webConfig.ts'

/** The text an invite is shared as: the same `#config=` link the Add-device QR code carries, so the invitee's device sets itself up. */
export function inviteShareMessage(config: FirebaseWebConfig): string {
  return `Join the household on Home Catalogue: ${deviceTransferUrl(config)}`
}
