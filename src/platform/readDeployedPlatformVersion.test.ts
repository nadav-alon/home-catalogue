import { describe, expect, it, vi } from 'vitest'
import { core } from 'data-platform'

const doc = vi.fn((db: unknown, path: string) => ({ db, path }))
const getDoc = vi.fn()

vi.mock('firebase/firestore', () => ({
  doc: (db: unknown, path: string) => doc(db, path),
  getDoc: (ref: unknown) => getDoc(ref),
}))

describe('readDeployedPlatformVersion', () => {
  it('reads the version from meta/platform when it parses', async () => {
    const { readDeployedPlatformVersion } = await import('./readDeployedPlatformVersion.ts')
    getDoc.mockResolvedValueOnce({ data: () => ({ version: '1.2.3' }) })

    const version = await readDeployedPlatformVersion('fake-db' as never)

    expect(doc).toHaveBeenCalledWith('fake-db', core.PLATFORM_DOC_PATH)
    expect(version).toBe('1.2.3')
  })

  it('returns undefined when the doc does not exist', async () => {
    const { readDeployedPlatformVersion } = await import('./readDeployedPlatformVersion.ts')
    getDoc.mockResolvedValueOnce({ data: () => undefined })

    expect(await readDeployedPlatformVersion('fake-db' as never)).toBeUndefined()
  })

  it('returns undefined when the doc does not match the schema', async () => {
    const { readDeployedPlatformVersion } = await import('./readDeployedPlatformVersion.ts')
    getDoc.mockResolvedValueOnce({ data: () => ({ version: 'not-a-semver' }) })

    expect(await readDeployedPlatformVersion('fake-db' as never)).toBeUndefined()
  })
})
