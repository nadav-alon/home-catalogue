import { useEffect, useState } from 'preact/hooks'
import { registerSW } from 'virtual:pwa-register'
import './UpdateNotice.css'

/**
 * Registers the service worker and, once a newer build has taken over while the app is open,
 * says so. A first install or an already-current build never calls `onNeedReload`, so it shows nothing.
 */
export function UpdateNotice() {
  const [updated, setUpdated] = useState(false)

  useEffect(() => {
    registerSW({ onNeedReload: () => setUpdated(true) })
  }, [])

  if (!updated) return null

  return (
    <div role="status" class="update-notice">
      <p>A new version is available.</p>
    </div>
  )
}
