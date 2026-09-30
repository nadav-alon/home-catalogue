import { beforeEach, describe, expect, it, vi } from 'vitest'
import { core } from 'data-platform'
import type { ItemRecord } from '../catalogue/items.ts'
import { bandages, cleaning, grocery, pharmacy } from '../catalogue/testFixtures.ts'
import { accessToken } from './googleAuthClient.ts'
import { exportDate } from './exportDate.ts'
import { exportShoppingList } from './exportShoppingList.ts'
import { GoogleCalendarApiError } from './googleCalendarApi.ts'
import type { ShopGroup } from './shopGroups.ts'

const requestCalendarAccessToken = vi.fn()
vi.mock('./googleAuthClient.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./googleAuthClient.ts')>()),
  requestCalendarAccessToken: () => requestCalendarAccessToken(),
}))

const findOrCreateAppCalendar = vi.fn()
const forgetAppCalendar = vi.fn()
const insertCalendarEvent = vi.fn()
vi.mock('./googleCalendarApi.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./googleCalendarApi.ts')>()),
  findOrCreateAppCalendar: (token: unknown) => findOrCreateAppCalendar(token),
  forgetAppCalendar: () => forgetAppCalendar(),
  insertCalendarEvent: (token: unknown, calendarId: unknown, event: unknown) =>
    insertCalendarEvent(token, calendarId, event),
}))

const outBandages: ItemRecord = { ...bandages, state: 'out' }
const soap: ItemRecord = {
  id: core.itemId('soap'),
  name: 'Dish soap',
  state: 'running low',
  categoryId: cleaning.id,
  necessity: 'important',
}

const groups: ShopGroup[] = [
  { shop: pharmacy, items: [outBandages] },
  { shop: grocery, items: [soap] },
]
const date = exportDate('2026-03-05')

beforeEach(() => {
  requestCalendarAccessToken.mockReset()
  findOrCreateAppCalendar.mockReset()
  forgetAppCalendar.mockReset()
  insertCalendarEvent.mockReset()
})

describe('exportShoppingList', () => {
  it('inserts one event per Shop group into the found/created app calendar', async () => {
    requestCalendarAccessToken.mockResolvedValueOnce(accessToken('a-token'))
    findOrCreateAppCalendar.mockResolvedValueOnce('app-cal')
    insertCalendarEvent.mockResolvedValue(undefined)

    const result = await exportShoppingList(groups, date)

    expect(result).toEqual({ status: 'exported' })
    expect(findOrCreateAppCalendar).toHaveBeenCalledWith('a-token')
    expect(insertCalendarEvent).toHaveBeenCalledTimes(2)
    expect(insertCalendarEvent).toHaveBeenCalledWith('a-token', 'app-cal', expect.objectContaining({ summary: 'Pharmacy' }))
    expect(insertCalendarEvent).toHaveBeenCalledWith('a-token', 'app-cal', expect.objectContaining({ summary: 'Grocery' }))
  })

  it('falls back to a deep link per Shop when the token request fails', async () => {
    requestCalendarAccessToken.mockRejectedValueOnce(new Error('popup blocked'))

    const result = await exportShoppingList(groups, date)

    expect(result.status).toBe('fallback')
    if (result.status !== 'fallback') throw new Error('expected fallback')
    expect(result.links.map((link) => link.shopName)).toEqual(['Pharmacy', 'Grocery'])
    expect(result.links.every((link) => link.url.startsWith('https://calendar.google.com/calendar/render?'))).toBe(true)
    expect(findOrCreateAppCalendar).not.toHaveBeenCalled()
  })

  it('falls back to a deep link only for the Shops not yet inserted when the Calendar API fails partway through', async () => {
    requestCalendarAccessToken.mockResolvedValueOnce(accessToken('a-token'))
    findOrCreateAppCalendar.mockResolvedValueOnce('app-cal')
    insertCalendarEvent.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('quota exceeded'))

    const result = await exportShoppingList(groups, date)

    expect(result.status).toBe('fallback')
    if (result.status !== 'fallback') throw new Error('expected fallback')
    expect(result.links.map((link) => link.shopName)).toEqual(['Grocery'])
  })

  it('forgets the app calendar when the Calendar API says it is gone (404)', async () => {
    requestCalendarAccessToken.mockResolvedValueOnce(accessToken('a-token'))
    findOrCreateAppCalendar.mockResolvedValueOnce('app-cal')
    insertCalendarEvent.mockRejectedValueOnce(new GoogleCalendarApiError('gone', 404))

    await exportShoppingList(groups, date)

    expect(forgetAppCalendar).toHaveBeenCalledOnce()
  })

  it('forgets the app calendar when the Calendar API refuses it (403)', async () => {
    requestCalendarAccessToken.mockResolvedValueOnce(accessToken('a-token'))
    findOrCreateAppCalendar.mockResolvedValueOnce('app-cal')
    insertCalendarEvent.mockRejectedValueOnce(new GoogleCalendarApiError('forbidden', 403))

    await exportShoppingList(groups, date)

    expect(forgetAppCalendar).toHaveBeenCalledOnce()
  })

  it('does not forget the app calendar for an unrelated failure', async () => {
    requestCalendarAccessToken.mockResolvedValueOnce(accessToken('a-token'))
    findOrCreateAppCalendar.mockResolvedValueOnce('app-cal')
    insertCalendarEvent.mockRejectedValueOnce(new GoogleCalendarApiError('quota exceeded', 429))

    await exportShoppingList(groups, date)

    expect(forgetAppCalendar).not.toHaveBeenCalled()
  })
  it('reports the underlying error to the global banner alongside the fallback', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { resetWriteRejections, watchWriteRejections } = await import('../catalogue/writeRejections.ts')
    resetWriteRejections()
    let messages: string[] = []
    watchWriteRejections((list) => {
      messages = list.map((rejection) => rejection.message)
    })
    const failure = new Error('403 insufficient scope')
    requestCalendarAccessToken.mockResolvedValueOnce('a-token')
    findOrCreateAppCalendar.mockRejectedValueOnce(failure)

    const result = await exportShoppingList(groups, date)

    expect(result.status).toBe('fallback')
    expect(messages).toEqual(["Could not add the Export to Google Calendar; add each Shop's event with the links below: 403 insufficient scope"])
    expect(consoleError).toHaveBeenCalledWith(expect.any(String), failure)
    consoleError.mockRestore()
  })
})
