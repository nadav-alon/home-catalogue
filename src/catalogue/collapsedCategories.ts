import type { catalogue } from 'data-platform'

const STORAGE_KEY = 'home-catalogue:collapsed-categories'

/** Identifies the "Uncategorised" group, which has no Category id. A Firestore id never contains `/`, so it cannot collide with one. */
export const UNCATEGORISED = '/uncategorised'

/** What a group on the Items screen is collapsed by: its Category id, or {@link UNCATEGORISED}. */
export type GroupKey = catalogue.CategoryId | typeof UNCATEGORISED

/** The groups this device has collapsed; empty if none are stored or the stored value is unreadable. */
export function getCollapsedGroups(): ReadonlySet<string> {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw === null) return new Set()
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((entry): entry is string => typeof entry === 'string'))
  } catch {
    return new Set()
  }
}

export function saveCollapsedGroups(groups: ReadonlySet<string>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...groups]))
}
