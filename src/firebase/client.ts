import { initializeApp, type FirebaseApp } from 'firebase/app'
import { initializeFirestore, persistentLocalCache, type Firestore } from 'firebase/firestore'
import type { FirebaseWebConfig } from './webConfig.ts'

export interface FirebaseClient {
  app: FirebaseApp
  db: Firestore
}

/** Initialises Firestore with a persistent local cache, so writes queue while offline. */
export function initFirebase(config: FirebaseWebConfig): FirebaseClient {
  const app = initializeApp(config)
  const db = initializeFirestore(app, { localCache: persistentLocalCache() })
  return { app, db }
}
