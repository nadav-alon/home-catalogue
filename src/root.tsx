import { useEffect, useState } from 'preact/hooks'
import { App } from './app.tsx'
import { AuthGate } from './auth/AuthGate.tsx'
import { SetupScreen } from './setup/SetupScreen.tsx'
import { clearFirebaseConfig, getStoredFirebaseConfig, saveFirebaseConfig } from './firebase/configStorage.ts'
import { initFirebase, terminateFirebase, type FirebaseClient } from './firebase/client.ts'
import type { FirebaseWebConfig } from './firebase/webConfig.ts'

export function Root() {
  const [config, setConfig] = useState<FirebaseWebConfig | null>(getStoredFirebaseConfig)

  if (config === null) {
    return (
      <SetupScreen
        onConfigured={(newConfig) => {
          saveFirebaseConfig(newConfig)
          setConfig(newConfig)
        }}
      />
    )
  }

  return <Connected config={config} onReset={() => setConfig(null)} />
}

function Connected({ config, onReset }: { config: FirebaseWebConfig; onReset: () => void }) {
  const [client, setClient] = useState<FirebaseClient | null>(null)

  useEffect(() => {
    setClient(initFirebase(config))
  }, [config])

  if (client === null) return null

  return (
    <>
      <AuthGate client={client}>
        <App />
      </AuthGate>
      <button
        type="button"
        onClick={async () => {
          await terminateFirebase(client)
          clearFirebaseConfig()
          onReset()
        }}
      >
        Reset Firebase configuration
      </button>
    </>
  )
}
