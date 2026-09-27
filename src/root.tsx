import { useMemo, useState } from 'preact/hooks'
import { App } from './app.tsx'
import { SetupScreen } from './setup/SetupScreen.tsx'
import { clearFirebaseConfig, getStoredFirebaseConfig, storeFirebaseConfig } from './firebase/configStore.ts'
import { initFirebase } from './firebase/client.ts'
import type { FirebaseWebConfig } from './firebase/webConfig.ts'

export function Root() {
  const [config, setConfig] = useState<FirebaseWebConfig | null>(getStoredFirebaseConfig)

  if (config === null) {
    return (
      <SetupScreen
        onConfigured={(newConfig) => {
          storeFirebaseConfig(newConfig)
          setConfig(newConfig)
        }}
      />
    )
  }

  return <Connected config={config} onReset={() => setConfig(null)} />
}

function Connected({ config, onReset }: { config: FirebaseWebConfig; onReset: () => void }) {
  useMemo(() => initFirebase(config), [config])

  return (
    <>
      <App />
      <button
        type="button"
        onClick={() => {
          clearFirebaseConfig()
          onReset()
        }}
      >
        Reset Firebase configuration
      </button>
    </>
  )
}
