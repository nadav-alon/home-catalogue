import type { CalendarEventResource } from './calendarEvent.ts'
import type { AccessToken } from './googleAuthClient.ts'

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3'

/** The calendar this app creates for its exported events, distinct from any calendar a household already has. */
const APP_CALENDAR_SUMMARY = 'Home Catalogue'

/** Persists the app calendar's id across exports, so a repeat export reuses it instead of creating a duplicate. */
const CALENDAR_ID_STORAGE_KEY = 'home-catalogue:calendarId'

declare const calendarIdBrand: unique symbol

/** A Google Calendar id. */
export type CalendarId = string & { readonly [calendarIdBrand]: true }

export function isCalendarId(value: string): value is CalendarId {
  return value.length > 0
}

export class InvalidCalendarIdError extends Error {}

/** Narrows, or throws {@link InvalidCalendarIdError} naming the offending value. */
export function calendarId(value: string): CalendarId {
  if (!isCalendarId(value)) {
    throw new InvalidCalendarIdError(`Calendar id must not be empty, got ${JSON.stringify(value)}`)
  }
  return value
}

export class GoogleCalendarApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function callCalendarApi(accessToken: AccessToken, path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${CALENDAR_API_BASE}${path}`, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  })
  if (!response.ok) {
    throw new GoogleCalendarApiError(`Google Calendar API request to ${path} failed: ${response.status}`, response.status)
  }
  return response.json()
}

/** Narrows a `calendars.insert` response to its {@link CalendarId}, refusing a malformed one. */
function parseCalendarId(response: unknown): CalendarId {
  const id = typeof response === 'object' && response !== null && 'id' in response ? response.id : undefined
  if (typeof id !== 'string' || !isCalendarId(id)) {
    throw new GoogleCalendarApiError('Google Calendar API did not return a calendar id.', 0)
  }
  return id
}

/**
 * The id of the calendar this app creates for its exported events. The `calendar.app.created`
 * scope this app requests does not permit `calendarList.list`, so an existing calendar can't be
 * discovered by listing — only one this device itself created and remembered can be reused. Call
 * {@link forgetAppCalendar} once the stored id stops working, so the next call here creates a
 * fresh one instead of retrying the same one forever.
 */
export async function findOrCreateAppCalendar(accessToken: AccessToken): Promise<CalendarId> {
  const stored = localStorage.getItem(CALENDAR_ID_STORAGE_KEY)
  if (stored !== null && isCalendarId(stored)) return stored

  const created = await callCalendarApi(accessToken, '/calendars', {
    method: 'POST',
    body: JSON.stringify({ summary: APP_CALENDAR_SUMMARY }),
  })
  const calendarId = parseCalendarId(created)
  localStorage.setItem(CALENDAR_ID_STORAGE_KEY, calendarId)
  return calendarId
}

/** Forgets the persisted app calendar id, e.g. after Google refuses it as gone (404) or inaccessible (403). */
export function forgetAppCalendar(): void {
  localStorage.removeItem(CALENDAR_ID_STORAGE_KEY)
}

/** Inserts one event into `calendarId`. */
export async function insertCalendarEvent(
  accessToken: AccessToken,
  calendarId: CalendarId,
  event: CalendarEventResource,
): Promise<void> {
  await callCalendarApi(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    body: JSON.stringify(event),
  })
}
