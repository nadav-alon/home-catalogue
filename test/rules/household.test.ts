// @vitest-environment node
import { readFileSync } from 'node:fs'
import type { Firestore } from 'firebase/firestore'
import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { core } from 'data-platform'
import { claimHousehold, householdExists, isHouseholdMember, joinFromInvite } from '../../src/auth/household.ts'

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

/** Seeds a Household already claimed by `alice`, bypassing rules. */
async function seedClaimedHousehold(): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().doc(core.HOUSEHOLD_DOC_PATH).set({ owner: alice })
  })
}

/** The same rules path the Firestore emulator itself loads, per `firebase.json`. */
function rulesPath(): string {
  const { firestore } = JSON.parse(readFileSync('firebase.json', 'utf8')) as { firestore: { rules: string } }
  return firestore.rules
}

beforeAll(async () => {
  const projectId = process.env.GCLOUD_PROJECT
  if (!projectId) {
    throw new Error('GCLOUD_PROJECT is not set; run this suite through `npm run test:rules`')
  }
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: readFileSync(rulesPath(), 'utf8'),
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
    await seedClaimedHousehold()

    const db = dbFor(testEnv.authenticatedContext(mallory))
    await expect(householdExists(db)).resolves.toBe(true)
  })
})

describe('isHouseholdMember against the real rules', () => {
  it("is false for a signed-in non-member's own member doc", async () => {
    const db = dbFor(testEnv.authenticatedContext(mallory))
    await expect(isHouseholdMember(db, mallory)).resolves.toBe(false)
  })

  it('is false for a signed-in non-member once the household is claimed by someone else', async () => {
    await seedClaimedHousehold()

    const db = dbFor(testEnv.authenticatedContext(mallory))
    await expect(householdExists(db)).resolves.toBe(true)
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
    await seedClaimedHousehold()

    const db = dbFor(testEnv.authenticatedContext(mallory))
    await assertFails(claimHousehold(db, mallory, core.email('mallory@example.com')))
  })
})

describe('joinFromInvite against the real rules', () => {
  const guestEmail = core.email('guest@example.com')

  async function seedInvite(): Promise<void> {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(core.inviteDocPath(guestEmail)).set({ invitedAt: new Date() })
    })
  }

  function guestDb(): Firestore {
    return dbFor(testEnv.authenticatedContext(mallory, { email: 'Guest@Example.com', email_verified: true }))
  }

  it('makes an invited user a Member and consumes the invite', async () => {
    await seedClaimedHousehold()
    await seedInvite()

    const db = guestDb()
    await expect(joinFromInvite(db, mallory, guestEmail)).resolves.toBe(true)

    await expect(isHouseholdMember(db, mallory)).resolves.toBe(true)
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const invite = await context.firestore().doc(core.inviteDocPath(guestEmail)).get()
      expect(invite.exists).toBe(false)
    })
  })

  it('does not join a user with no invite', async () => {
    await seedClaimedHousehold()

    const db = guestDb()
    await expect(joinFromInvite(db, mallory, guestEmail)).resolves.toBe(false)
    await expect(isHouseholdMember(db, mallory)).resolves.toBe(false)
  })
})
