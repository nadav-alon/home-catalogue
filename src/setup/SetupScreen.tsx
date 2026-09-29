import { useState } from 'preact/hooks'
import type { JSX } from 'preact'
import { parseFirebaseWebConfigSnippet, type FirebaseWebConfig } from '../firebase/webConfig.ts'
import { HOUSEHOLD_SETUP_DOC_URL } from '../links.ts'

export interface SetupScreenProps {
  onConfigured: (config: FirebaseWebConfig) => void
  /** An error to show up front, e.g. from a device transfer link that failed to parse. */
  initialError?: string | null
}

export function SetupScreen({ onConfigured, initialError = null }: SetupScreenProps) {
  const [configText, setConfigText] = useState('')
  const [error, setError] = useState<string | null>(initialError)

  function handleSubmit(event: JSX.TargetedEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      onConfigured(parseFirebaseWebConfigSnippet(configText))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid Firebase configuration')
    }
  }

  return (
    <main>
      <h1>Set up Home Catalogue</h1>
      <p>
        Paste your household's Firebase web config below. Not set up a Household yet? Follow the{' '}
        <a href={HOUSEHOLD_SETUP_DOC_URL}>household setup guide</a>.
      </p>
      <form onSubmit={handleSubmit}>
        <label htmlFor="firebase-config">Firebase web config</label>
        <textarea
          id="firebase-config"
          value={configText}
          onInput={(event) => setConfigText(event.currentTarget.value)}
        />
        {error !== null && <p role="alert">{error}</p>}
        <button type="submit">Save</button>
      </form>
    </main>
  )
}
