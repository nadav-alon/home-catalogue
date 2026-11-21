import { useEffect, useState } from 'preact/hooks'
import { core } from 'data-platform'
import { App } from './app.tsx'
import { AuthGate } from './auth/AuthGate.tsx'
import { SetupScreen } from './setup/SetupScreen.tsx'
import {
  authClient,
  clearFirebaseWebConfig,
  getStoredFirebaseWebConfig,
  initFirebase,
  InvalidFirebaseWebConfigError,
  parseConfigFragment,
  saveFirebaseWebConfig,
  terminateFirebase,
  type FirebaseClient,
  type FirebaseWebConfig,
} from 'data-platform/client'
import { migrateLegacyFirebaseConfig } from './firebase/legacyConfig.ts'
import { sameFirebaseWebConfig } from './firebase/webConfig.ts'
import { uxWiring } from './firebase/uxMode.ts'
import { readDeployedPlatformVersion } from './platform/readDeployedPlatformVersion.ts'
import { PlatformBanner } from './platform/PlatformBanner.tsx'

interface RootState {
  config: FirebaseWebConfig | null
  setupError: string | null
}

/**
 * Resolves a `#config=` fragment left by a device transfer QR code, if any, against whatever is
 * already stored: saves it and strips the fragment, asking first when it would replace a
 * different stored config. In ux mode the demo config is used and storage is never read. Runs
 * once, synchronously, before the first paint.
 */
function resolveInitialState(): RootState {
  const ux = uxWiring()
  if (ux !== null) return { config: ux.config, setupError: null }

  migrateLegacyFirebaseConfig()
  const stored = getStoredFirebaseWebConfig()

  let incoming: FirebaseWebConfig | null
  try {
    incoming = parseConfigFragment(location.hash)
  } catch (err) {
    history.replaceState(null, '', location.pathname + location.search)
    const message = err instanceof InvalidFirebaseWebConfigError ? err.message : 'Invalid device transfer link.'
    return { config: stored, setupError: message }
  }
  if (incoming === null) return { config: stored, setupError: null }

  history.replaceState(null, '', location.pathname + location.search)

  if (stored !== null) {
    if (sameFirebaseWebConfig(stored, incoming)) return { config: stored, setupError: null }
    if (!confirm('Replace the stored Firebase configuration with the scanned one?')) {
      return { config: stored, setupError: null }
    }
  }

  saveFirebaseWebConfig(incoming)
  return { config: incoming, setupError: null }
}

export function Root() {
  const [{ config, setupError }, setState] = useState<RootState>(resolveInitialState)

  if (config === null) {
    return (
      <SetupScreen
        initialError={setupError}
        onConfigured={(newConfig) => {
          saveFirebaseWebConfig(newConfig)
          setState({ config: newConfig, setupError: null })
        }}
      />
    )
  }

  return <Connected config={config} onReset={() => setState({ config: null, setupError: null })} />
}

function Connected({ config, onReset }: { config: FirebaseWebConfig; onReset: () => void }) {
  const [client, setClient] = useState<FirebaseClient | null>(null)

  useEffect(() => {
    const ux = uxWiring()
    setClient(initFirebase(config, { local: ux?.local }))
  }, [config])

  if (client === null) return null

  const resetConfig = async () => {
    await terminateFirebase(client)
    clearFirebaseWebConfig()
    onReset()
  }

  return (
    <>
      <AuthGate client={client} onResetConfig={resetConfig}>
        <PlatformGuard db={client.db} />
        <App
          db={client.db}
          config={config}
          onSignOut={() => authClient(client.app).signOut()}
          onResetConfig={resetConfig}
        />
      </AuthGate>
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
