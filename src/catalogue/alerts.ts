import { catalogue, core } from 'data-platform'

/** `none` shows no banner; `soon` a yellow one; `now` a red one, see {@link alertLevel}. */
export type AlertLevel = 'none' | 'soon' | 'now'

const TABLE: Record<catalogue.Necessity, Record<core.State, AlertLevel>> = {
  essential: { enough: 'none', 'running low': 'now', out: 'now' },
  important: { enough: 'none', 'running low': 'soon', out: 'now' },
  optional: { enough: 'none', 'running low': 'none', out: 'soon' },
}

/** The Necessity × State table from `CONTEXT.md`'s Alert entry. */
export function alertLevel(necessity: catalogue.Necessity, state: core.State): AlertLevel {
  return TABLE[necessity][state]
}
