import { catalogue, core } from 'data-platform'
import { alertLevel, type AlertLevel } from './alerts.ts'
import './AlertBanner.css'

export interface AlertBannerItem {
  necessity: catalogue.Necessity
  state: core.State
}

export interface AlertBannerProps {
  items: AlertBannerItem[]
}

function itemNoun(count: number): string {
  return `Item${count === 1 ? '' : 's'}`
}

const BANNERS: Record<
  Exclude<AlertLevel, 'none'>,
  { role: 'alert' | 'status'; className: string; text: (count: number) => string }
> = {
  now: {
    role: 'alert',
    className: 'alert-banner alert-banner--now',
    text: (count) => `${count} urgent ${itemNoun(count)}`,
  },
  soon: {
    role: 'status',
    className: 'alert-banner alert-banner--soon',
    text: (count) => `${count} ${itemNoun(count)} to buy soon (not urgent)`,
  },
}

/**
 * Names only the count of Items at this Alert level, not the Shopping list's count — the Shopping
 * list is every Item at `running low` or `out`, whatever its Alert level, so the two counts can
 * differ.
 */
function banner(level: Exclude<AlertLevel, 'none'>, count: number) {
  const { role, className, text } = BANNERS[level]
  return (
    <div role={role} className={className}>
      <p>
        {text(count)}
      </p>
    </div>
  )
}

/** Error-coloured for any `now` Item, else secondary-coloured for any `soon`, else nothing. Never both at once. */
export function AlertBanner({ items }: AlertBannerProps) {
  const levels = items.map((item) => alertLevel(item.necessity, item.state))

  const nowCount = levels.filter((level) => level === 'now').length
  if (nowCount > 0) return banner('now', nowCount)

  const soonCount = levels.filter((level) => level === 'soon').length
  if (soonCount > 0) return banner('soon', soonCount)

  return null
}
