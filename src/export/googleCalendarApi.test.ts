import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CalendarEventResource } from './calendarEvent.ts'
import { accessToken } from './googleAuthClient.ts'
import {
  calendarId,
  findOrCreateAppCalendar,
  forgetAppCalendar,
  GoogleCalendarApiError,
  insertCalendarEvent,
  isCalendarId,
} from './googleCalendarApi.ts'

const fetchMock = vi.fn()
const token = accessToken('a-token')

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: () => Promise.resolve(body) } as Response
}

describe('isCalendarId', () => {
  it('accepts a non-empty string', () => {
    expect(isCalendarId('app-cal')).toBe(true)
  })

  it('rejects an empty string', () => {
    expect(isCalendarId('')).toBe(false)
  })
})

describe('findOrCreateAppCalendar', () => {
  it('creates a Home Catalogue calendar when none is stored yet', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'new-cal' }))

    const id = await findOrCreateAppCalendar(token)

    expect(id).toBe('new-cal')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/calendars')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ summary: 'Home Catalogue' })
  })

  it('reuses the stored calendar id instead of calling the API again', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'new-cal' }))
    await findOrCreateAppCalendar(token)
    fetchMock.mockReset()

    const id = await findOrCreateAppCalendar(token)

    expect(id).toBe('new-cal')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('creates a fresh calendar once the stored one has been forgotten', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'new-cal' }))
    await findOrCreateAppCalendar(token)
    forgetAppCalendar()
    fetchMock.mockReset()
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'another-cal' }))

    const id = await findOrCreateAppCalendar(token)

    expect(id).toBe('another-cal')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('throws GoogleCalendarApiError, carrying the status, when the request fails', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 401))

    const error = await findOrCreateAppCalendar(token).catch((err: unknown) => err)

    expect(error).toBeInstanceOf(GoogleCalendarApiError)
    expect((error as GoogleCalendarApiError).status).toBe(401)
  })

  it('throws GoogleCalendarApiError when the response has no calendar id', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}))

    await expect(findOrCreateAppCalendar(token)).rejects.toThrow(GoogleCalendarApiError)
  })
})

describe('insertCalendarEvent', () => {
  it('posts the event resource to the calendar events endpoint', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'event-1' }))
    const event: CalendarEventResource = {
      summary: 'Pharmacy',
      description: 'Bandages',
      start: { date: '2026-03-05' as never },
      end: { date: '2026-03-06' as never },
      reminders: { useDefault: false, overrides: [] },
    }

    await insertCalendarEvent(token, calendarId('app-cal'), event)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/calendars/app-cal/events')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual(event)
  })

  it('throws GoogleCalendarApiError when the request fails', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 500))
    const event: CalendarEventResource = {
      summary: 'Pharmacy',
      description: 'Bandages',
      start: { date: '2026-03-05' as never },
      end: { date: '2026-03-06' as never },
      reminders: { useDefault: false, overrides: [] },
    }

    await expect(insertCalendarEvent(token, calendarId('app-cal'), event)).rejects.toThrow(GoogleCalendarApiError)
  })
})
