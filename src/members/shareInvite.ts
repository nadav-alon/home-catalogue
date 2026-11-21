import { householdTransferUrl } from '../firebase/householdTransferUrl.ts'
import type { FirebaseWebConfig } from 'data-platform/client'

/** The text an invite is shared as: the same `#config=` link the Add-device QR code carries, so the invitee's device sets itself up. */
export function inviteShareMessage(config: FirebaseWebConfig): string {
  return `Join the household on Home Catalogue: ${householdTransferUrl(config)}`
}
