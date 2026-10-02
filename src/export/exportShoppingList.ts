import { buildShopEvent } from './calendarEvent.ts'
import { shopDeepLink } from './calendarDeepLink.ts'
import type { ExportDate } from './exportDate.ts'
import { GoogleSignInCancelledError, requestCalendarAccessToken } from './googleAuthClient.ts'
import { findOrCreateAppCalendar, forgetAppCalendar, GoogleCalendarApiError, insertCalendarEvent } from './googleCalendarApi.ts'
import type { ShopGroup } from './shopGroups.ts'

export interface ShopFallbackLink {
  shopName: string
  url: string
}

export type ExportResult =
  | { status: 'exported' }
  | { status: 'fallback'; links: ShopFallbackLink[] }
  | { status: 'cancelled' }

/**
 * Exports one Calendar event per `groups` entry, in order. A Shop's event is never retried or
 * duplicated once inserted: if a later group fails, only the groups not yet inserted fall back to
 * a deep link, so the household is never asked to add an event that is already on the Calendar.
 * If the app calendar itself is gone (404) or no longer accessible (403), the persisted calendar
 * id is forgotten so the next export creates a fresh one instead of failing the same way again.
 * A household that closes the Google sign-in popup gets `cancelled`, not links: nothing failed, and
 * they can simply export again. The underlying error of any other failure is only logged; the
 * dialog's fallback links are the user-facing report.
 */
export async function exportShoppingList(groups: ShopGroup[], date: ExportDate): Promise<ExportResult> {
  let insertedCount = 0
  try {
    const accessToken = await requestCalendarAccessToken()
    const calendarId = await findOrCreateAppCalendar(accessToken)
    for (const group of groups) {
      await insertCalendarEvent(accessToken, calendarId, buildShopEvent(group, date))
      insertedCount++
    }
    return { status: 'exported' }
  } catch (err) {
    if (err instanceof GoogleSignInCancelledError) return { status: 'cancelled' }
    console.error('Could not add the Export to Google Calendar', err)
    if (err instanceof GoogleCalendarApiError && (err.status === 404 || err.status === 403)) {
      forgetAppCalendar()
    }
    return {
      status: 'fallback',
      links: groups.slice(insertedCount).map((group) => ({ shopName: group.shop.name, url: shopDeepLink(group, date) })),
    }
  }
}
