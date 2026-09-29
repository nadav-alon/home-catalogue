import type { catalogue, core } from 'data-platform'

export type AlertLevel = 'now' | 'soon'

/**
 * The catalogue Alert rule: Necessity × State. `enough` never alerts; `essential` always alerts
 * `now` once pending; `important` alerts `now` only once `out`; `optional` alerts `soon` only
 * once `out`.
 */
export function alertLevel(necessity: catalogue.Necessity, state: core.State): AlertLevel | undefined {
  if (state === 'enough') return undefined
  if (necessity === 'essential') return 'now'
  if (necessity === 'important') return state === 'out' ? 'now' : 'soon'
  return state === 'out' ? 'soon' : undefined
}

/** Whether any of `items` carries Alert `now`, per {@link alertLevel}. */
export function hasAlertNow(items: readonly { necessity: catalogue.Necessity; state: core.State }[]): boolean {
  return items.some((item) => alertLevel(item.necessity, item.state) === 'now')
}
