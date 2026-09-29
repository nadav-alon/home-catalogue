import { FirebaseError } from 'firebase/app'
import { describe, expect, it } from 'vitest'
import { isRulesRefusal } from './rulesRefusal.ts'

describe('isRulesRefusal', () => {
  it('is true for a FirebaseError with code permission-denied', () => {
    expect(isRulesRefusal(new FirebaseError('permission-denied', 'denied'))).toBe(true)
  })

  it('is false for a FirebaseError with a different code', () => {
    expect(isRulesRefusal(new FirebaseError('unavailable', 'offline'))).toBe(false)
  })

  it('is false for a plain Error', () => {
    expect(isRulesRefusal(new Error('boom'))).toBe(false)
  })
})
