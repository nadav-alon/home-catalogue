import { describe, expect, it } from 'vitest'
import { firebaseWebConfig } from 'data-platform/client'
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
  it('invites to Home Catalogue with the #config link built from the current page, dropping a stale fragment', () => {
    history.replaceState(null, '', '/#stale')
    expect(inviteShareMessage(config)).toMatch(/^Join the household on Home Catalogue: http:\/\/localhost:3000\/#config=/)
  })
})
