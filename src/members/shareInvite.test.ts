import { describe, expect, it } from 'vitest'
import { deviceTransferUrl } from '../firebase/deviceTransfer.ts'
import { firebaseWebConfig } from '../firebase/webConfig.ts'
import { inviteShareMessage } from './shareInvite.ts'

const config = firebaseWebConfig({
  apiKey: 'AIzaSyDOCAbC123dEf456GhI789jKl012-MnO',
  authDomain: 'household.firebaseapp.com',
  projectId: 'household',
  storageBucket: 'household.appspot.com',
  messagingSenderId: '123456789',
  appId: '1:123456789:web:abcdef',
})

describe('inviteShareMessage', () => {
  it('invites to Home Catalogue with the same #config link as the Add-device QR code', () => {
    expect(inviteShareMessage(config)).toBe(`Join the household on Home Catalogue: ${deviceTransferUrl(config)}`)
  })
})
