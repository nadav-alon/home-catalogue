import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CalendarEventResource } from './calendarEvent.ts'
import { findOrCreateAppCalendar, GoogleCalendarApiError, insertCalendarEvent } from './googleCalendarApi.ts'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: () => Promise.resolve(body) } as Response
}

describe('findOrCreateAppCalendar', () => {
  it('reuses an existing Home Catalogue calendar instead of creating another', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ items: [{ id: 'other', summary: 'Other' }, { id: 'app-cal', summary: 'Home Catalogue' }] }),
    )

    const calendarId = await findOrCreateAppCalendar('a-token')

    expect(calendarId).toBe('app-cal')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/users/me/calendarList')
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ headers: expect.objectContaining({ Authorization: 'Bearer a-token' }) })
  })

  it('creates a Home Catalogue calendar when none exists yet', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: 'new-cal' }))

    const calendarId = await findOrCreateAppCalendar('a-token')

    expect(calendarId).toBe('new-cal')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(url).toContain('/calendars')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ summary: 'Home Catalogue' })
  })

  it('throws GoogleCalendarApiError when the request fails', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 401))

    await expect(findOrCreateAppCalendar('a-token')).rejects.toThrow(GoogleCalendarApiError)
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

    await insertCalendarEvent('a-token', 'app-cal', event)

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

    await expect(insertCalendarEvent('a-token', 'app-cal', event)).rejects.toThrow(GoogleCalendarApiError)
  })
})
