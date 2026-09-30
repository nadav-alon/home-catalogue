import { afterEach, beforeEach } from 'vitest'
import { resetWriteRejections, watchWriteRejections } from '../../src/catalogue/writeRejections.ts'

/**
 * Collects the banner's write-rejection messages for the current test: subscribes in `beforeEach`
 * (after clearing rejections left by earlier tests), unsubscribes in `afterEach`. Call it inside a
 * `describe` or at the top of a test file; the returned function reads the messages shown so far.
 */
export function useRejectedMessages(): () => string[] {
  let messages: string[] = []
  let unsubscribe: (() => void) | undefined
  beforeEach(() => {
    resetWriteRejections()
    unsubscribe = watchWriteRejections((list) => {
      messages = list.map((rejection) => rejection.message)
    })
  })
  afterEach(() => {
    unsubscribe?.()
  })
  return () => messages
}
