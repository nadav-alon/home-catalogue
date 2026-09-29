import type { CalendarEventResource } from './calendarEvent.ts'

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3'

/** The calendar this app creates for its exported events, distinct from any calendar a household already has. */
const APP_CALENDAR_SUMMARY = 'Home Catalogue'

export class GoogleCalendarApiError extends Error {}

async function callCalendarApi(accessToken: string, path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${CALENDAR_API_BASE}${path}`, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  })
  if (!response.ok) {
    throw new GoogleCalendarApiError(`Google Calendar API request to ${path} failed: ${response.status}`)
  }
  return response.json()
}

/**
 * The id of the calendar named {@link APP_CALENDAR_SUMMARY}: an existing one is reused, so a
 * repeat export does not scatter events across duplicate calendars; otherwise one is created.
 */
export async function findOrCreateAppCalendar(accessToken: string): Promise<string> {
  const list = (await callCalendarApi(accessToken, '/users/me/calendarList')) as {
    items?: { id: string; summary?: string }[]
  }
  const existing = list.items?.find((entry) => entry.summary === APP_CALENDAR_SUMMARY)
  if (existing !== undefined) return existing.id

  const created = (await callCalendarApi(accessToken, '/calendars', {
    method: 'POST',
    body: JSON.stringify({ summary: APP_CALENDAR_SUMMARY }),
  })) as { id: string }
  return created.id
}

/** Inserts one event into `calendarId`. */
export async function insertCalendarEvent(
  accessToken: string,
  calendarId: string,
  event: CalendarEventResource,
): Promise<void> {
  await callCalendarApi(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    body: JSON.stringify(event),
  })
}
