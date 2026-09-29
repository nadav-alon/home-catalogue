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

const redStyle: JSX.CSSProperties = { backgroundColor: '#fee2e2', color: '#991b1b' }
const yellowStyle: JSX.CSSProperties = { backgroundColor: '#fef9c3', color: '#854d0e' }

/** Red for any `now` Item, else yellow for any `soon`, else nothing. Never both at once. */
export function AlertBanner({ items }: AlertBannerProps) {
  const levels = items.map((item) => alertLevel(item.necessity, item.state))
  const nowCount = levels.filter((level) => level === 'now').length
  const soonCount = levels.filter((level) => level === 'soon').length

  if (nowCount > 0) {
    return (
      <div role="alert" style={redStyle}>
        <p>
          {nowCount} Item{nowCount === 1 ? '' : 's'} need shopping now — see the{' '}
          <a href={SHOPPING_LIST_ANCHOR}>shopping list</a>.
        </p>
      </div>
    )
  }

  if (soonCount > 0) {
    return (
      <div role="status" style={yellowStyle}>
        <p>
          {soonCount} Item{soonCount === 1 ? '' : 's'} will need shopping soon — see the{' '}
          <a href={SHOPPING_LIST_ANCHOR}>shopping list</a>.
        </p>
      </div>
    )
  }

  return null
}
