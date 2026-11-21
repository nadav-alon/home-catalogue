import { describe, expect, it, vi } from 'vitest'
import type { FirebaseClient } from 'data-platform/client'

const deleteApp = vi.fn((_app: unknown) => Promise.resolve())
const terminate = vi.fn((_db: unknown) => Promise.resolve())

vi.mock('firebase/app', () => ({
  deleteApp: (app: unknown) => deleteApp(app),
}))

vi.mock('firebase/firestore', () => ({
  terminate: (db: unknown) => terminate(db),
}))

describe('terminateFirebase', () => {
  it('terminates Firestore before deleting the app', async () => {
    const { terminateFirebase } = await import('./terminateFirebase.ts')
    const client = { app: { name: 'fake-app' }, db: { type: 'fake-firestore' } } as unknown as FirebaseClient
    const calls: string[] = []
    terminate.mockImplementationOnce(async (_db: unknown) => {
      calls.push('terminate')
    })
    deleteApp.mockImplementationOnce(async (_app: unknown) => {
      calls.push('deleteApp')
    })

    await terminateFirebase(client)

    expect(terminate).toHaveBeenCalledWith(client.db)
    expect(deleteApp).toHaveBeenCalledWith(client.app)
    expect(calls).toEqual(['terminate', 'deleteApp'])
  })
})
