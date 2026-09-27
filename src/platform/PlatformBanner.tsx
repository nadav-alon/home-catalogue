import type { core } from 'data-platform'
import { HOUSEHOLD_SETUP_DOC_URL } from '../links.ts'

export interface PlatformBannerProps {
  /** `null` while the check hasn't resolved yet. */
  check: core.PlatformCheck | null
}

/** Nothing for `ok` (or while unresolved); a blocking banner for `outdated` or `missing`. */
export function PlatformBanner({ check }: PlatformBannerProps) {
  if (check === null || check === 'ok') return null

  return (
    <div role="alert">
      <p>
        You need to update your platform deploy. Follow the{' '}
        <a href={HOUSEHOLD_SETUP_DOC_URL}>household setup guide</a>.
      </p>
    </div>
  )
}
