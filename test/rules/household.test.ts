// @vitest-environment node
import { readFileSync } from 'node:fs'
import type { Firestore } from 'firebase/firestore'
import {
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { core } from 'data-platform'
import { claimHousehold, householdExists, isHouseholdMember } from '../../src/auth/household.ts'

const alice = core.uid('alice')
const mallory = core.uid('mallory')

let testEnv: RulesTestEnvironment

/**
 * `RulesTestContext.firestore()` is typed as the compat SDK's `Firestore`, but the object it
 * returns bridges to the modular SDK too (the JS SDK's modular functions unwrap a compat
 * instance's delegate).
 */
function dbFor(context: RulesTestContext): Firestore {
  return context.firestore() as unknown as Firestore
}

beforeAll(async () => {
  const projectId = process.env.GCLOUD_PROJECT
  if (!projectId) {
    throw new Error('GCLOUD_PROJECT is not set; run this suite through `npm run test:rules`')
  }
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: readFileSync('node_modules/data-platform/firestore.rules', 'utf8'),
    },
  })
})

beforeEach(async () => {
  await testEnv.clearFirestore()
})

afterAll(async () => {
  await testEnv.cleanup()
})

describe('householdExists against the real rules', () => {
  it('is false for a signed-in non-member before anyone claims the household', async () => {
    const db = dbFor(testEnv.authenticatedContext(mallory))
    await expect(householdExists(db)).resolves.toBe(false)
  })

  it('is true for a signed-in non-member once the household is claimed', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(core.HOUSEHOLD_DOC_PATH).set({ owner: alice })
    })

    const db = dbFor(testEnv.authenticatedContext(mallory))
    await expect(householdExists(db)).resolves.toBe(true)
  })
})

describe('isHouseholdMember against the real rules', () => {
  it("is false for a signed-in non-member's own member doc", async () => {
    const db = dbFor(testEnv.authenticatedContext(mallory))
    await expect(isHouseholdMember(db, mallory)).resolves.toBe(false)
  })

  it("is true once the caller's own member doc exists", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(core.memberDocPath(alice)).set({
        email: core.email('alice@example.com'),
        addedAt: new Date(),
      })
    })

    const db = dbFor(testEnv.authenticatedContext(alice))
    await expect(isHouseholdMember(db, alice)).resolves.toBe(true)
  })
})

describe('claimHousehold against the real rules', () => {
  it('lets a signed-in non-member claim an unclaimed household', async () => {
    const db = dbFor(testEnv.authenticatedContext(alice))

    await claimHousehold(db, alice, core.email('alice@example.com'))

    await expect(householdExists(db)).resolves.toBe(true)
    await expect(isHouseholdMember(db, alice)).resolves.toBe(true)
  })

  it("denies a second signed-in non-member's claim once the household is already claimed", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(core.HOUSEHOLD_DOC_PATH).set({ owner: alice })
    })

    const db = dbFor(testEnv.authenticatedContext(mallory))
    await expect(claimHousehold(db, mallory, core.email('mallory@example.com'))).rejects.toThrow()
  })
})
