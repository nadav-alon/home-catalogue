import { firebaseWebConfig, InvalidFirebaseWebConfigError, type FirebaseWebConfig } from './webConfig.ts'

const FRAGMENT_PREFIX = '#config='

function toBase64Url(json: string): string {
  const bytes = new TextEncoder().encode(json)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): string {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/** The current page's URL carrying `config` as a `#config=` fragment, for a new device to scan. */
export function deviceTransferUrl(config: FirebaseWebConfig): string {
  const url = new URL(location.href)
  url.hash = `${FRAGMENT_PREFIX.slice(1)}${toBase64Url(JSON.stringify(config))}`
  return url.toString()
}

/**
 * Extracts and validates the config carried by a `#config=` fragment (as produced by
 * {@link deviceTransferUrl}). Returns `null` when `hash` carries no such fragment at all; throws
 * {@link InvalidFirebaseWebConfigError} when the fragment is present but truncated or invalid.
 */
export function parseConfigFragment(hash: string): FirebaseWebConfig | null {
  if (!hash.startsWith(FRAGMENT_PREFIX)) return null

  const payload = hash.slice(FRAGMENT_PREFIX.length)
  let parsed: unknown
  try {
    parsed = JSON.parse(fromBase64Url(payload))
  } catch {
    throw new InvalidFirebaseWebConfigError('That device transfer link is truncated or corrupted.')
  }
  return firebaseWebConfig(parsed)
}
