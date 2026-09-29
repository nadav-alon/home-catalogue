import { buildShopEvent } from './calendarEvent.ts'
import type { ExportDate } from './exportDate.ts'
import type { ShopGroup } from './shopGroups.ts'

function compact(date: ExportDate): string {
  return date.replaceAll('-', '')
}

/**
 * A Google Calendar "add event" deep link, built from the same {@link buildShopEvent} resource
 * the Calendar API call uses, so the two can't drift apart: used when the GIS token or Calendar
 * API is unavailable, so the household can still add the event by hand.
 */
export function shopDeepLink(group: ShopGroup, date: ExportDate): string {
  const event = buildShopEvent(group, date)
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.summary,
    dates: `${compact(event.start.date)}/${compact(event.end.date)}`,
    details: event.description,
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
