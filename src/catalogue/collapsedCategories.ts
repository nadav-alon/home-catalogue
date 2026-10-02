import { catalogue } from 'data-platform'

const STORAGE_KEY = 'home-catalogue:collapsed-categories'

/** Identifies the "Uncategorised" group, which has no Category id. A Firestore id never contains `/`, so it cannot collide with one. */
export const UNCATEGORISED = '/uncategorised'

/** What a group on the Items screen is collapsed by: its Category id, or {@link UNCATEGORISED}. */
export type GroupKey = catalogue.CategoryId | typeof UNCATEGORISED

function isGroupKey(value: string): value is GroupKey {
  return catalogue.isCategoryId(value) || value === UNCATEGORISED
}

/** The groups this device has collapsed; empty if none are stored, the stored value is unreadable, or storage is unavailable. */
export function getCollapsedGroups(): ReadonlySet<GroupKey> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return new Set()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((entry): entry is GroupKey => typeof entry === 'string' && isGroupKey(entry)))
  } catch {
    return new Set()
  }
}

/** Remembers the collapsed groups on this device; does nothing if storage is unavailable or full. */
export function saveCollapsedGroups(groups: ReadonlySet<GroupKey>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...groups]))
  } catch {
    // Collapse state is a convenience; losing it must not break the screen.
  }
}
