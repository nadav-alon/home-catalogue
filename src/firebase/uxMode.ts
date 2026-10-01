import type { FirebaseApp } from 'firebase/app'
import { inMemoryPersistence, type Persistence } from 'firebase/auth'
import { memoryLocalCache, type MemoryLocalCache } from 'firebase/firestore'
import { connectLocal, LOCAL_PROJECT_ID } from 'data-platform/local'
import { firebaseWebConfig, type FirebaseWebConfig } from './webConfig.ts'

export interface UxWiring {
  /** The config ux mode runs under, so setup is skipped. It names the kit's demo project and carries no real key. */
  config: FirebaseWebConfig
  /** Firestore's cache: in memory, so one run never shows the last run's items from disk. */
  localCache: MemoryLocalCache
  /** Auth's persistence: in memory, so every run comes up signed out whatever user the last run signed in as. */
  authPersistence: Persistence
  /** Points the app's Auth and Firestore at the local emulators, before either is first used. */
  connect: (app: FirebaseApp) => void
}

/**
 * The wiring for the `ux` Vite mode, or `null` in every other mode. The mode check sits inline,
 * where Vite folds it to a constant, so a production build drops the wiring and the emulator
 * kit it pulls in.
 */
export function uxWiring(): UxWiring | null {
  if (import.meta.env.MODE !== 'ux') return null
  return {
    config: firebaseWebConfig({
      apiKey: 'local',
      authDomain: `${LOCAL_PROJECT_ID}.firebaseapp.com`,
      projectId: LOCAL_PROJECT_ID,
      storageBucket: `${LOCAL_PROJECT_ID}.appspot.com`,
      messagingSenderId: '0',
      appId: '1:0:web:local',
    }),
    localCache: memoryLocalCache(),
    authPersistence: inMemoryPersistence,
    connect: connectLocal,
  }
}
