import {
  firebaseWebConfig,
  getStoredFirebaseWebConfig,
  saveFirebaseWebConfig,
  type ConfigStorage,
} from 'data-platform/client'

const LEGACY_STORAGE_KEY = 'home-catalogue:firebase-config'

/**
 * Moves a config stored under the app's own key to the platform-wide key, then removes the old
 * key. A config already under the platform key wins; an old value that is no longer a valid
 * config is dropped rather than moved. Does nothing when the old key is absent.
 */
export function migrateLegacyFirebaseConfig(storage: ConfigStorage = localStorage): void {
  const raw = storage.getItem(LEGACY_STORAGE_KEY)
  if (raw === null) return
  storage.removeItem(LEGACY_STORAGE_KEY)
  if (getStoredFirebaseWebConfig(storage) !== null) return
  try {
    saveFirebaseWebConfig(firebaseWebConfig(JSON.parse(raw)), storage)
  } catch {
    // An unreadable old value is dropped.
  }
}
