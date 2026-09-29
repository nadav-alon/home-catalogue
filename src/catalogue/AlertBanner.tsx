import type { JSX } from 'preact'
import { catalogue, core } from 'data-platform'
import { alertLevel, type AlertLevel } from './alerts.ts'

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
  { role: 'alert' | 'status'; style: JSX.CSSProperties; text: (count: number) => string }
> = {
  now: {
    role: 'alert',
    style: { backgroundColor: '#fee2e2', color: '#991b1b' },
    text: (count) => `${count} urgent ${itemNoun(count)}`,
  },
  soon: {
    role: 'status',
    style: { backgroundColor: '#fef9c3', color: '#854d0e' },
    text: (count) => `${count} ${itemNoun(count)} to buy soon (not urgent)`,
  },
}

/**
 * Names only the count of Items at this Alert level, not the Shopping list's count — the Shopping
 * list is every Item at `running low` or `out`, whatever its Alert level, so the two counts can
 * differ.
 */
function banner(level: Exclude<AlertLevel, 'none'>, count: number) {
  const { role, style, text } = BANNERS[level]
  return (
    <div role={role} style={style}>
      <p>
        {text(count)}
      </p>
    </div>
  )
}

/** Red for any `now` Item, else yellow for any `soon`, else nothing. Never both at once. */
export function AlertBanner({ items }: AlertBannerProps) {
  const levels = items.map((item) => alertLevel(item.necessity, item.state))

  const nowCount = levels.filter((level) => level === 'now').length
  if (nowCount > 0) return banner('now', nowCount)

  const soonCount = levels.filter((level) => level === 'soon').length
  if (soonCount > 0) return banner('soon', soonCount)

  return null
}
