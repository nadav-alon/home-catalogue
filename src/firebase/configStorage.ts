import { firebaseWebConfig, type FirebaseWebConfig } from './webConfig.ts'

const STORAGE_KEY = 'home-catalogue:firebase-config'

/** The stored config, or `null` if none is stored or the stored value is no longer valid. */
export function getStoredFirebaseConfig(): FirebaseWebConfig | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw === null) return null
  try {
    return firebaseWebConfig(JSON.parse(raw))
  } catch {
    return null
  }
}

export function saveFirebaseConfig(config: FirebaseWebConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

export function clearFirebaseConfig(): void {
  localStorage.removeItem(STORAGE_KEY)
}
