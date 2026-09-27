import type { FirebaseOptions } from 'firebase/app'

declare const firebaseWebConfigBrand: unique symbol

/** A parsed Firebase web config that has passed {@link isFirebaseWebConfig}. */
export type FirebaseWebConfig = FirebaseOptions & { readonly [firebaseWebConfigBrand]: true }

const REQUIRED_FIELDS = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
] as const satisfies readonly (keyof FirebaseOptions)[]

export class InvalidFirebaseWebConfigError extends Error {}

export function isFirebaseWebConfig(value: unknown): value is FirebaseWebConfig {
  if (typeof value !== 'object' || value === null) return false
  return missingFields(value).length === 0
}

function missingFields(value: unknown): readonly string[] {
  const record = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  return REQUIRED_FIELDS.filter((field) => typeof record[field] !== 'string' || record[field] === '')
}

/** Narrows or throws {@link InvalidFirebaseWebConfigError} naming the missing fields. */
export function firebaseWebConfig(value: unknown): FirebaseWebConfig {
  if (!isFirebaseWebConfig(value)) {
    throw new InvalidFirebaseWebConfigError(
      `Firebase config is missing or has an empty: ${missingFields(value).join(', ')}`,
    )
  }
  return value
}

/** Parses pasted JSON text into a validated config, or throws {@link InvalidFirebaseWebConfigError}. */
export function parseFirebaseWebConfigJson(json: string): FirebaseWebConfig {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new InvalidFirebaseWebConfigError('That is not valid JSON.')
  }
  return firebaseWebConfig(parsed)
}
