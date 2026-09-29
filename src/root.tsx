import { useEffect, useState } from 'preact/hooks'
import { core } from 'data-platform'
import { App } from './app.tsx'
import { AuthGate } from './auth/AuthGate.tsx'
import { SetupScreen } from './setup/SetupScreen.tsx'
import { clearFirebaseConfig, getStoredFirebaseConfig, saveFirebaseConfig } from './firebase/configStorage.ts'
import { initFirebase, terminateFirebase, type FirebaseClient } from './firebase/client.ts'
import type { FirebaseWebConfig } from './firebase/webConfig.ts'
import { readDeployedPlatformVersion } from './platform/readDeployedPlatformVersion.ts'
import { PlatformBanner } from './platform/PlatformBanner.tsx'

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
        <PlatformGuard db={client.db} />
        <App db={client.db} />
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

/** Reads `meta/platform` once the household member is signed in, and blocks with a banner if it's outdated or missing. */
function PlatformGuard({ db }: { db: FirebaseClient['db'] }) {
  const [platformCheck, setPlatformCheck] = useState<core.PlatformCheck | null>(null)

  useEffect(() => {
    let cancelled = false
    setPlatformCheck(null)
    readDeployedPlatformVersion(db).then((deployed) => {
      if (!cancelled) setPlatformCheck(core.checkPlatform(deployed))
    })
    return () => {
      cancelled = true
    }
  }, [db])

  return <PlatformBanner check={platformCheck} />
}
