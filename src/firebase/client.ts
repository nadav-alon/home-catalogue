import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app'
import { initializeFirestore, persistentLocalCache, terminate, type Firestore } from 'firebase/firestore'
import { uxWiring } from './uxMode.ts'
import type { FirebaseWebConfig } from './webConfig.ts'

export interface FirebaseClient {
  app: FirebaseApp
  db: Firestore
}

/**
 * Initialises Firestore with a persistent local cache, so writes queue while offline. In ux mode
 * it uses the memory cache instead, then creates Auth, then points both at the local emulators,
 * before either is first used.
 */
export function initFirebase(config: FirebaseWebConfig): FirebaseClient {
  const app = initializeApp(config)
  const ux = uxWiring()
  const db = initializeFirestore(app, { localCache: ux?.localCache ?? persistentLocalCache() })
  if (ux !== null) {
    ux.initAuth(app)
    ux.connect(app)
  }
  return { app, db }
}

/** Tears down a client from {@link initFirebase}, so the `[DEFAULT]` app can be re-initialised from a different config. */
export async function terminateFirebase(client: FirebaseClient): Promise<void> {
  await terminate(client.db)
  await deleteApp(client.app)
}
