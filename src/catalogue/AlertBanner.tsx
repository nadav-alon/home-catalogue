import type { JSX } from 'preact'
import { catalogue, core } from 'data-platform'
import { alertLevel } from './alerts.ts'
import { SHOPPING_LIST_ANCHOR } from '../links.ts'

export interface AlertBannerItem {
  necessity: catalogue.Necessity
  state: core.State
}

export interface AlertBannerProps {
  items: AlertBannerItem[]
}

const BANNERS: Record<
  'now' | 'soon',
  { role: 'alert' | 'status'; style: JSX.CSSProperties; text: (count: number, plural: string) => string }
> = {
  now: {
    role: 'alert',
    style: { backgroundColor: '#fee2e2', color: '#991b1b' },
    text: (count, plural) => `${count} urgent Item${plural}`,
  },
  soon: {
    role: 'status',
    style: { backgroundColor: '#fef9c3', color: '#854d0e' },
    text: (count, plural) => `${count} Item${plural} soon to be urgent`,
  },
}

/**
 * Names only the count of Items at this Alert level, not the Shopping list's count — the Shopping
 * list also includes non-urgent running-low Items, so the two counts can differ.
 */
function banner(level: 'now' | 'soon', count: number) {
  const { role, style, text } = BANNERS[level]
  return (
    <div role={role} style={style}>
      <p>
        {text(count, count === 1 ? '' : 's')} — see the <a href={SHOPPING_LIST_ANCHOR}>shopping list</a>.
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
