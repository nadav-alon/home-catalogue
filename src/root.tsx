import { useEffect, useRef, useState } from 'preact/hooks'
import { App } from './app.tsx'
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
  const clientRef = useRef<FirebaseClient | null>(null)

  useEffect(() => {
    clientRef.current = initFirebase(config)
  }, [config])

  return (
    <>
      <App />
      <button
        type="button"
        onClick={async () => {
          if (clientRef.current) await terminateFirebase(clientRef.current)
          clearFirebaseConfig()
          onReset()
        }}
      >
        Reset Firebase configuration
      </button>
    </>
  )
}
