import type { LocalKit } from 'data-platform/client'
import { localKit, LOCAL_PROJECT_ID } from 'data-platform/local'
import { firebaseWebConfig, type FirebaseWebConfig } from './webConfig.ts'

export interface UxWiring {
  /** The config ux mode runs under, so setup is skipped. It names the kit's demo project and carries no real key. */
  config: FirebaseWebConfig
  /** The local kit `initFirebase` runs against: a memory cache, in-memory Auth with the emulator popup, and both pointed at the emulators. */
  local: LocalKit
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
    local: localKit,
  }
}
