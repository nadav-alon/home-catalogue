import { nextExportDate, type ExportDate } from './exportDate.ts'
import type { ShopGroup } from './shopGroups.ts'

function compact(date: ExportDate): string {
  return date.replaceAll('-', '')
}

/**
 * A Google Calendar "add event" deep link, pre-filled the same way as the Calendar API event:
 * used when the GIS token or Calendar API is unavailable, so the household can still add the
 * event by hand.
 */
export function shopDeepLink(group: ShopGroup, date: ExportDate): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: group.shop.name,
    dates: `${compact(date)}/${compact(nextExportDate(date))}`,
    details: group.items.map((item) => item.name).join('\n'),
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
