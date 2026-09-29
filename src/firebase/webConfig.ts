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

/** Thrown by {@link parseFirebaseWebConfigSnippet} when no `{...}` object literal is found at all. */
const NO_OBJECT_LITERAL_MESSAGE =
  "That doesn't look like a Firebase config. Paste the firebaseConfig block from the Firebase console."

/** Thrown by {@link parseFirebaseWebConfigSnippet} when an extracted object literal still fails to parse. */
const UNPARSEABLE_OBJECT_LITERAL_MESSAGE =
  "Found a firebaseConfig block but couldn't read it. Paste it unedited from the Firebase console."

/** Whether `a` and `b` carry the same fields, regardless of key order. */
export function sameFirebaseWebConfig(a: FirebaseWebConfig, b: FirebaseWebConfig): boolean {
  const normalize = (config: FirebaseWebConfig) => JSON.stringify(config, Object.keys(config).sort())
  return normalize(a) === normalize(b)
}

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

/**
 * Finds the `{...}` object literal span in text such as `const firebaseConfig = {...};`. Anchors
 * on the `firebaseConfig =` assignment when present, so a `{` earlier in the snippet — the
 * console's own `import { initializeApp } from "…";` line, say — isn't mistaken for the start of
 * the config.
 */
function extractObjectLiteral(text: string): string | null {
  const assignment = /firebaseConfig\s*=\s*/.exec(text)
  const searchFrom = assignment ? assignment.index + assignment[0].length : 0
  const start = text.indexOf('{', searchFrom)
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

/** Quotes bare identifier keys (`apiKey:`) so the object literal parses as JSON. */
function quoteBareKeys(objectLiteral: string): string {
  let result = ''
  let inString: '"' | "'" | null = null
  for (let i = 0; i < objectLiteral.length; i++) {
    const char = objectLiteral[i]
    if (inString !== null) {
      result += char
      if (char === '\\') result += objectLiteral[++i] ?? ''
      else if (char === inString) inString = null
      continue
    }
    if (char === '"' || char === "'") {
      inString = char
      result += char
      continue
    }
    // Only preceded by `{` or `,` (ignoring whitespace) so a value's own text is never touched.
    const bareKey = /^[{,](\s*)([A-Za-z_$][\w$]*)(\s*):/.exec(objectLiteral.slice(i - 1))
    if (i > 0 && bareKey) {
      result += `${bareKey[1]}"${bareKey[2]}"${bareKey[3]}:`
      i += bareKey[0].length - 2
      continue
    }
    result += char
  }
  return result
}

/**
 * Parses a pasted Firebase config into a validated config, or throws
 * {@link InvalidFirebaseWebConfigError}. Accepts both a bare JSON object and the JavaScript
 * snippet the Firebase console hands out (`const firebaseConfig = { apiKey: "...", ... };`).
 */
export function parseFirebaseWebConfigSnippet(snippet: string): FirebaseWebConfig {
  const objectLiteral = extractObjectLiteral(snippet)
  if (objectLiteral === null) {
    throw new InvalidFirebaseWebConfigError(NO_OBJECT_LITERAL_MESSAGE)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(quoteBareKeys(objectLiteral))
  } catch {
    throw new InvalidFirebaseWebConfigError(UNPARSEABLE_OBJECT_LITERAL_MESSAGE)
  }
  return firebaseWebConfig(parsed)
}
