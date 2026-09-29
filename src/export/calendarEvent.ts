import { alertLevel } from '../catalogue/alerts.ts'
import { nextExportDate, type ExportDate } from './exportDate.ts'
import type { ShopGroup } from './shopGroups.ts'

/** A Google Calendar API v3 event resource, restricted to the fields the export writes. */
export interface CalendarEventResource {
  summary: string
  description: string
  start: { date: ExportDate }
  end: { date: ExportDate }
  reminders: { useDefault: false; overrides: { method: 'popup'; minutes: number }[] }
}

/**
 * One all-day event for `group`'s Shop on `date`, its pending Items listed in the description.
 * Carries a same-day popup reminder when any Item is at Alert `now` (see {@link alertLevel}).
 */
export function buildShopEvent(group: ShopGroup, date: ExportDate): CalendarEventResource {
  const hasAlertNow = group.items.some((item) => alertLevel(item.necessity, item.state) === 'now')
  return {
    summary: group.shop.name,
    description: group.items.map((item) => item.name).join('\n'),
    start: { date },
    end: { date: nextExportDate(date) },
    reminders: {
      useDefault: false,
      overrides: hasAlertNow ? [{ method: 'popup', minutes: 0 }] : [],
    },
  }
}
