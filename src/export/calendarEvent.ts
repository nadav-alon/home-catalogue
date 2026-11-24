import { recipeChipLabels, type RecipeRecord } from '../catalogue/recipes.ts'
import { alertLevel } from '../catalogue/alerts.ts'
import { nextExportDate, type ExportDate } from './exportDate.ts'
import type { ExportGroup, RecipesByItem } from './shopGroups.ts'

/** A Google Calendar API v3 event resource, restricted to the fields the export writes. */
export interface CalendarEventResource {
  summary: string
  description: string
  start: { date: ExportDate }
  end: { date: ExportDate }
  reminders: { useDefault: false; overrides: { method: 'popup'; minutes: number }[] }
}

/** `name` followed by one "(for <Recipe>)" per chip the Shopping list shows on the row, so the line reads as the row does. */
function withChips(name: string, recipes: readonly RecipeRecord[]): string {
  return [name, ...recipeChipLabels(recipes).map(({ label }) => `(${label})`)].join(' ')
}

/**
 * One all-day event for `group` on `date`, its pending Items (chipped by `neededBy`) then its Recipe rows listed in the description.
 * Carries a popup reminder at midnight on `date` when any Item is at Alert `now` (see
 * {@link alertLevel}): the Calendar API only accepts non-negative reminder offsets, so midnight
 * is the earliest same-day time an all-day event's reminder can name.
 */
export function buildShopEvent(group: ExportGroup, neededBy: RecipesByItem, date: ExportDate): CalendarEventResource {
  const hasAlertNow = group.items.some((item) => alertLevel(item.necessity, item.state) === 'now')
  return {
    summary: group.groupName,
    description: [
      ...group.items.map((item) => withChips(item.name, neededBy.get(item.id) ?? [])),
      ...group.recipeRows.map((row) => withChips(row.name, [row.recipe])),
    ].join('\n'),
    start: { date },
    end: { date: nextExportDate(date) },
    reminders: {
      useDefault: false,
      overrides: hasAlertNow ? [{ method: 'popup', minutes: 0 }] : [],
    },
  }
}
