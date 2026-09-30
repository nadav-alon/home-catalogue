// @vitest-environment node
import { readFileSync } from 'node:fs'
import { doc, getDoc, increment, setDoc, waitForPendingWrites, writeBatch, type Firestore } from 'firebase/firestore'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { catalogue, core } from 'data-platform'
import { deleteShop, restoreShop } from '../../src/catalogue/shops.ts'
import { resetWriteRejections, watchWriteRejections } from '../../src/catalogue/writeRejections.ts'
import { useRejectedMessages } from './rejectedMessages.ts'
import { CategoryInUseError, deleteCategory, restoreCategory, type CategoryRecord } from '../../src/catalogue/categories.ts'

const alice = core.uid('alice')

let testEnv: RulesTestEnvironment

const rejected = useRejectedMessages()

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

/** Seeds a Pharmacy Shop and a Medicine Category defaulting to it, bypassing rules. */
async function seedPharmacyAndMedicine(references: { shopReferences: number; categoryReferences: number }): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().doc(`${catalogue.SHOPS_COLLECTION}/pharmacy`).set({
      name: 'Pharmacy',
      referenceCount: references.shopReferences,
    })
    await context.firestore().doc(`${catalogue.CATEGORIES_COLLECTION}/medicine`).set({
      name: 'Medicine',
      defaultShopId: 'pharmacy',
      referenceCount: references.categoryReferences,
    })
  })
}

/** The same rules path the Firestore emulator itself loads, per `firebase.json`. */
function rulesPath(): string {
  const { firestore } = JSON.parse(readFileSync('firebase.json', 'utf8')) as { firestore: { rules: string } }
  return firestore.rules
}

/** The Shop's document as the server holds it, bypassing the rules and the client's cache. */
async function serverDoc(id: string) {
  let data: Record<string, unknown> | undefined
  await testEnv.withSecurityRulesDisabled(async (context) => {
    data = (await context.firestore().doc(`${catalogue.SHOPS_COLLECTION}/${id}`).get()).data()
  })
  return data
}

/** Waits for a queued write to reach the server, since the Shop writes resolve before it does. */
async function waitForServerDoc(id: string, predicate: (data: Record<string, unknown> | undefined) => boolean) {
  await vi.waitFor(async () => expect(predicate(await serverDoc(id))).toBe(true))
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
  const pharmacyRecord = { id: catalogue.shopId('pharmacy'), name: 'Pharmacy', referenceCount: 0 }

  it('soft-deletes a Shop with no dependents, and restoreShop brings it back', async () => {
    const db = dbFor(testEnv.authenticatedContext(alice))
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`${catalogue.SHOPS_COLLECTION}/pharmacy`).set({
        name: 'Pharmacy',
        referenceCount: 0,
      })
    })

    await deleteShop(db, pharmacyRecord)
    await waitForServerDoc('pharmacy', (data) => data?.deletedAt !== undefined)

    await restoreShop(db, pharmacyRecord)
    await waitForServerDoc('pharmacy', (data) => data !== undefined && data.deletedAt === undefined)
  })

  it('reports to the write-rejection banner and leaves the Shop live while a Category still defaults to it, independent of the local cache', async () => {
    resetWriteRejections()
    let latest: string[] = []
    watchWriteRejections((list) => {
      latest = list.map((rejection) => rejection.message)
    })
    const db = dbFor(testEnv.authenticatedContext(alice))
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`${catalogue.SHOPS_COLLECTION}/pharmacy`).set({
        name: 'Pharmacy',
        referenceCount: 1,
      })
    })

    await deleteShop(db, pharmacyRecord)

    await vi.waitFor(() => expect(latest).toEqual(['Could not save deleted Shop Pharmacy']))
    const data = await serverDoc('pharmacy')
    expect(data?.deletedAt).toBeUndefined()
  })
})

describe('Category writes against the real rules', () => {
  it('accepts a new Category that starts unreferenced and bumps its default Shop in the same batch', async () => {
    const db = dbFor(testEnv.authenticatedContext(alice))
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`${catalogue.SHOPS_COLLECTION}/pharmacy`).set({
        name: 'Pharmacy',
        referenceCount: 0,
      })
    })

    const batch = writeBatch(db)
    batch.set(doc(db, catalogue.CATEGORIES_COLLECTION, 'medicine'), {
      name: 'Medicine',
      defaultShopId: 'pharmacy',
      referenceCount: 0,
    })
    batch.update(doc(db, catalogue.SHOPS_COLLECTION, 'pharmacy'), { referenceCount: increment(1) })

    await assertSucceeds(batch.commit())
  })

  it('denies a new Category that skips bumping its default Shop in the same batch', async () => {
    const db = dbFor(testEnv.authenticatedContext(alice))
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`${catalogue.SHOPS_COLLECTION}/pharmacy`).set({
        name: 'Pharmacy',
        referenceCount: 0,
      })
    })

    await assertFails(
      setDoc(doc(db, catalogue.CATEGORIES_COLLECTION, 'medicine'), {
        name: 'Medicine',
        defaultShopId: 'pharmacy',
        referenceCount: 0,
      }),
    )
  })
})

describe('deleteCategory against the real rules', () => {
  const medicine: CategoryRecord = {
    id: catalogue.categoryId('medicine'),
    name: 'Medicine',
    defaultShopId: catalogue.shopId('pharmacy'),
    referenceCount: 0,
  }

  it("soft-deletes a Category with no dependents and drops its default Shop's reference", async () => {
    const db = dbFor(testEnv.authenticatedContext(alice))
    await seedPharmacyAndMedicine({ shopReferences: 1, categoryReferences: 0 })

    await expect(deleteCategory(db, medicine)).resolves.toBeUndefined()
    await waitForPendingWrites(db)
    const categorySnapshot = await getDoc(doc(db, catalogue.CATEGORIES_COLLECTION, 'medicine'))
    expect(categorySnapshot.data()?.deletedAt).toBeDefined()
    const shopSnapshot = await getDoc(doc(db, catalogue.SHOPS_COLLECTION, 'pharmacy'))
    expect(shopSnapshot.data()?.referenceCount).toBe(0)
  })

  it("restores a soft-deleted Category and raises its default Shop's reference back", async () => {
    const db = dbFor(testEnv.authenticatedContext(alice))
    await seedPharmacyAndMedicine({ shopReferences: 1, categoryReferences: 0 })
    await deleteCategory(db, medicine)
    await waitForPendingWrites(db)

    await restoreCategory(db, medicine)
    await waitForPendingWrites(db)

    const categorySnapshot = await getDoc(doc(db, catalogue.CATEGORIES_COLLECTION, 'medicine'))
    expect(categorySnapshot.data()?.deletedAt).toBeUndefined()
    const shopSnapshot = await getDoc(doc(db, catalogue.SHOPS_COLLECTION, 'pharmacy'))
    expect(shopSnapshot.data()?.referenceCount).toBe(1)
  })

  it('refuses up front with CategoryInUseError when the cached referenceCount is above 0', async () => {
    const db = dbFor(testEnv.authenticatedContext(alice))
    await seedPharmacyAndMedicine({ shopReferences: 1, categoryReferences: 1 })

    await expect(deleteCategory(db, { ...medicine, referenceCount: 1 })).rejects.toBeInstanceOf(CategoryInUseError)
    const categorySnapshot = await getDoc(doc(db, catalogue.CATEGORIES_COLLECTION, 'medicine'))
    expect(categorySnapshot.data()?.deletedAt).toBeUndefined()
  })

  it('has the rules refuse a stale-cache delete while an Item still belongs to it, and shows it in the banner', async () => {
    const db = dbFor(testEnv.authenticatedContext(alice))
    await seedPharmacyAndMedicine({ shopReferences: 1, categoryReferences: 1 })
    await deleteCategory(db, medicine)
    await vi.waitFor(() => expect(rejected()).toEqual(['Could not save deleted Category Medicine']))
    const categorySnapshot = await getDoc(doc(db, catalogue.CATEGORIES_COLLECTION, 'medicine'))
    expect(categorySnapshot.data()?.deletedAt).toBeUndefined()
  })
})

describe('CatalogueItem writes against the real rules', () => {
  it('accepts a new CatalogueItem that bumps its Category in the same batch', async () => {
    const db = dbFor(testEnv.authenticatedContext(alice))
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`${catalogue.CATEGORIES_COLLECTION}/medicine`).set({
        name: 'Medicine',
        defaultShopId: 'pharmacy',
        referenceCount: 0,
      })
    })

    const batch = writeBatch(db)
    batch.set(doc(db, catalogue.CATALOGUE_ITEMS_COLLECTION, 'bandages'), {
      categoryId: 'medicine',
      necessity: 'essential',
    })
    batch.update(doc(db, catalogue.CATEGORIES_COLLECTION, 'medicine'), { referenceCount: increment(1) })

    await assertSucceeds(batch.commit())
  })

  it('denies a new CatalogueItem that skips bumping its Category in the same batch', async () => {
    const db = dbFor(testEnv.authenticatedContext(alice))
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`${catalogue.CATEGORIES_COLLECTION}/medicine`).set({
        name: 'Medicine',
        defaultShopId: 'pharmacy',
        referenceCount: 0,
      })
    })

    await assertFails(
      setDoc(doc(db, catalogue.CATALOGUE_ITEMS_COLLECTION, 'bandages'), {
        categoryId: 'medicine',
        necessity: 'essential',
      }),
    )
  })

  it('moves the Category referenceCount by one each way when a CatalogueItem changes Category', async () => {
    const db = dbFor(testEnv.authenticatedContext(alice))
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`${catalogue.CATEGORIES_COLLECTION}/medicine`).set({
        name: 'Medicine',
        defaultShopId: 'pharmacy',
        referenceCount: 1,
      })
      await context.firestore().doc(`${catalogue.CATEGORIES_COLLECTION}/cleaning`).set({
        name: 'Cleaning',
        defaultShopId: 'pharmacy',
        referenceCount: 0,
      })
      await context.firestore().doc(`${catalogue.CATALOGUE_ITEMS_COLLECTION}/bandages`).set({
        categoryId: 'medicine',
        necessity: 'essential',
      })
    })

    const batch = writeBatch(db)
    batch.update(doc(db, catalogue.CATALOGUE_ITEMS_COLLECTION, 'bandages'), {
      categoryId: 'cleaning',
      necessity: 'essential',
    })
    batch.update(doc(db, catalogue.CATEGORIES_COLLECTION, 'medicine'), { referenceCount: increment(-1) })
    batch.update(doc(db, catalogue.CATEGORIES_COLLECTION, 'cleaning'), { referenceCount: increment(1) })

    await assertSucceeds(batch.commit())
  })

  it('denies moving a CatalogueItem to a new Category without adjusting both referenceCounts', async () => {
    const db = dbFor(testEnv.authenticatedContext(alice))
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`${catalogue.CATEGORIES_COLLECTION}/medicine`).set({
        name: 'Medicine',
        defaultShopId: 'pharmacy',
        referenceCount: 1,
      })
      await context.firestore().doc(`${catalogue.CATEGORIES_COLLECTION}/cleaning`).set({
        name: 'Cleaning',
        defaultShopId: 'pharmacy',
        referenceCount: 0,
      })
      await context.firestore().doc(`${catalogue.CATALOGUE_ITEMS_COLLECTION}/bandages`).set({
        categoryId: 'medicine',
        necessity: 'essential',
      })
    })

    await assertFails(
      setDoc(doc(db, catalogue.CATALOGUE_ITEMS_COLLECTION, 'bandages'), {
        categoryId: 'cleaning',
        necessity: 'essential',
      }),
    )
  })
})
