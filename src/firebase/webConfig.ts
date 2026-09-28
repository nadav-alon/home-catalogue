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
      `Firebase config is missing or has empty fields: ${missingFields(value).join(', ')}`,
    )
  }
  return value
}

/** Finds the `{...}` object literal span in text such as `const firebaseConfig = {...};`. */
function extractObjectLiteral(text: string): string | null {
  const start = text.indexOf('{')
  if (start === -1) return null

  let depth = 0
  let inString: '"' | "'" | null = null
  for (let i = start; i < text.length; i++) {
    const char = text[i]
    if (inString !== null) {
      if (char === '\\') i++
      else if (char === inString) inString = null
      continue
    }
    if (char === '"' || char === "'") inString = char
    else if (char === '{') depth++
    else if (char === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

/**
 * Parses a pasted Firebase config into a validated config, or throws
 * {@link InvalidFirebaseWebConfigError}. Accepts both a bare JSON object and the JavaScript
 * snippet the Firebase console hands out (`const firebaseConfig = {...};`).
 */
export function parseFirebaseWebConfigSnippet(snippet: string): FirebaseWebConfig {
  const objectLiteral = extractObjectLiteral(snippet)
  if (objectLiteral === null) {
    throw new InvalidFirebaseWebConfigError('That is not a Firebase config.')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(objectLiteral)
  } catch {
    throw new InvalidFirebaseWebConfigError('That is not a Firebase config.')
  }
  return firebaseWebConfig(parsed)
}
