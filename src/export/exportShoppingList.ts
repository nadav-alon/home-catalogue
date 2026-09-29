import { buildShopEvent } from './calendarEvent.ts'
import { shopDeepLink } from './calendarDeepLink.ts'
import type { ExportDate } from './exportDate.ts'
import { requestCalendarAccessToken } from './googleAuthClient.ts'
import { findOrCreateAppCalendar, insertCalendarEvent } from './googleCalendarApi.ts'
import type { ShopGroup } from './shopGroups.ts'
import { reportWriteRejection } from '../catalogue/writeRejections.ts'

export interface ShopFallbackLink {
  shopName: string
  url: string
}

export type ExportResult = { status: 'exported' } | { status: 'fallback'; links: ShopFallbackLink[] }

/**
 * Exports one Calendar event per `groups` entry. If the GIS token request or any Calendar API
 * call fails, none of it is assumed to have landed, and the whole export falls back to a deep
 * link per Shop instead, so the household can still add every event by hand. The underlying error is reported through
 * {@link reportWriteRejection} so the fallback is never silent.
 */
export async function exportShoppingList(groups: ShopGroup[], date: ExportDate): Promise<ExportResult> {
  try {
    const accessToken = await requestCalendarAccessToken()
    const calendarId = await findOrCreateAppCalendar(accessToken)
    for (const group of groups) {
      await insertCalendarEvent(accessToken, calendarId, buildShopEvent(group, date))
    }
    return { status: 'exported' }
  } catch (err) {
    reportWriteRejection('Calendar export', err)
    return {
      status: 'fallback',
      links: groups.map((group) => ({ shopName: group.shop.name, url: shopDeepLink(group, date) })),
    }
  }
}
