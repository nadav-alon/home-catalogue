// @vitest-environment node
import { readFileSync } from 'node:fs'
import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { catalogue, core } from 'data-platform'
import { deleteShop, ShopInUseError } from '../../src/catalogue/shops.ts'

const alice = core.uid('alice')

let testEnv: RulesTestEnvironment

/**
 * `RulesTestContext.firestore()` is typed as the compat SDK's `Firestore`, but the object it
 * returns bridges to the modular SDK too (the JS SDK's modular functions unwrap a compat
 * instance's delegate).
 */
function dbFor(context: RulesTestContext): Firestore {
  return context.firestore() as unknown as Firestore
}

/** Seeds `alice` as a Household member, bypassing rules. */
async function seedMember(): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().doc(core.memberDocPath(alice)).set({
      email: core.email('alice@example.com'),
      addedAt: new Date(),
    })
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
  await seedMember()
})

afterAll(async () => {
  await testEnv.cleanup()
})

describe('Shop writes against the real rules', () => {
  it('accepts a new Shop that starts unreferenced', async () => {
    const db = dbFor(testEnv.authenticatedContext(alice))

    await assertSucceeds(
      setDoc(doc(db, catalogue.SHOPS_COLLECTION, 'pharmacy'), { name: 'Pharmacy', referenceCount: 0 }),
    )
  })

  it('denies a new Shop that claims to already be referenced', async () => {
    const db = dbFor(testEnv.authenticatedContext(alice))

    await assertFails(
      setDoc(doc(db, catalogue.SHOPS_COLLECTION, 'pharmacy'), { name: 'Pharmacy', referenceCount: 1 }),
    )
  })
})

describe('deleteShop against the real rules', () => {
  it('deletes a Shop with no dependents', async () => {
    const db = dbFor(testEnv.authenticatedContext(alice))
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`${catalogue.SHOPS_COLLECTION}/pharmacy`).set({
        name: 'Pharmacy',
        referenceCount: 0,
      })
    })

    await expect(deleteShop(db, catalogue.shopId('pharmacy'))).resolves.toBeUndefined()
    const snapshot = await getDoc(doc(db, catalogue.SHOPS_COLLECTION, 'pharmacy'))
    expect(snapshot.exists()).toBe(false)
  })

  it('refuses with ShopInUseError while a Category still defaults to it, independent of the local cache', async () => {
    const db = dbFor(testEnv.authenticatedContext(alice))
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`${catalogue.SHOPS_COLLECTION}/pharmacy`).set({
        name: 'Pharmacy',
        referenceCount: 1,
      })
    })

    await expect(deleteShop(db, catalogue.shopId('pharmacy'))).rejects.toBeInstanceOf(ShopInUseError)
    const snapshot = await getDoc(doc(db, catalogue.SHOPS_COLLECTION, 'pharmacy'))
    expect(snapshot.exists()).toBe(true)
  })
})
