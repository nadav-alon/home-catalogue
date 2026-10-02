import { useEffect, useState } from 'preact/hooks'
import { Button } from '../ui/Button.tsx'
import { announcedUpdates, watchUpdates } from './updates.ts'
import './UpdateNotice.css'

/**
 * Says so once a newer build has taken over while the app is open. Registration happens at startup
 * (`startUpdateWatch`); this only listens. Dismissing hides the current announcement, not later ones.
 */
export function UpdateNotice() {
  const [announced, setAnnounced] = useState(announcedUpdates)
  const [dismissed, setDismissed] = useState(0)

  useEffect(() => {
    setAnnounced(announcedUpdates())
    return watchUpdates(() => setAnnounced(announcedUpdates()))
  }, [])

  if (announced === 0 || dismissed === announced) return null

  return (
    <div role="status" class="update-notice">
      <p>A new version is available.</p>
      <Button variant="text" onClick={() => location.reload()}>
        Reload
      </Button>
      <Button variant="text" onClick={() => setDismissed(announced)}>
        Dismiss
      </Button>
    </div>
  )
}
