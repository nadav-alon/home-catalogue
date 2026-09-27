import { useState } from 'preact/hooks'
import type { JSX } from 'preact'
import { parseFirebaseWebConfigJson, type FirebaseWebConfig } from '../firebase/webConfig.ts'

const HOUSEHOLD_SETUP_DOC_URL = 'https://github.com/nadav-alon/data-platform/blob/main/docs/household-setup.md'

export interface SetupScreenProps {
  onConfigured: (config: FirebaseWebConfig) => void
}

export function SetupScreen({ onConfigured }: SetupScreenProps) {
  const [configText, setConfigText] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(event: JSX.TargetedEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      onConfigured(parseFirebaseWebConfigJson(configText))
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
