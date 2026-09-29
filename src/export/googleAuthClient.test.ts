import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CALENDAR_APP_CREATED_SCOPE,
  GOOGLE_OAUTH_CLIENT_ID,
  GoogleIdentityUnavailableError,
  requestCalendarAccessToken,
} from './googleAuthClient.ts'

const requestAccessToken = () => undefined

beforeEach(() => {
  delete (window as { google?: unknown }).google
})

afterEach(() => {
  delete (window as { google?: unknown }).google
})

describe('requestCalendarAccessToken', () => {
  it('rejects with GoogleIdentityUnavailableError when Google Identity Services never loaded', async () => {
    await expect(requestCalendarAccessToken()).rejects.toThrow(GoogleIdentityUnavailableError)
  })

  it('initialises the token client with the upstream client id and the calendar.app.created scope', () => {
    let seenConfig: { client_id: string; scope: string } | undefined
    window.google = {
      accounts: {
        oauth2: {
          initTokenClient: (config) => {
            seenConfig = config
            return { requestAccessToken }
          },
        },
      },
    }

    void requestCalendarAccessToken()

    expect(seenConfig).toMatchObject({ client_id: GOOGLE_OAUTH_CLIENT_ID, scope: CALENDAR_APP_CREATED_SCOPE })
  })

  it('requests the token, which must happen inside the same call so the popup is not blocked', () => {
    let requested = false
    window.google = {
      accounts: {
        oauth2: {
          initTokenClient: () => ({ requestAccessToken: () => (requested = true) }),
        },
      },
    }

    void requestCalendarAccessToken()

    expect(requested).toBe(true)
  })

  it('resolves with the access token the callback receives', async () => {
    window.google = {
      accounts: {
        oauth2: {
          initTokenClient: (config) => ({
            requestAccessToken: () => config.callback({ access_token: 'a-token' }),
          }),
        },
      },
    }

    await expect(requestCalendarAccessToken()).resolves.toBe('a-token')
  })

  it('rejects with the error the callback receives when no token is granted', async () => {
    window.google = {
      accounts: {
        oauth2: {
          initTokenClient: (config) => ({
            requestAccessToken: () => config.callback({ error: 'access_denied' }),
          }),
        },
      },
    }

    await expect(requestCalendarAccessToken()).rejects.toThrow('access_denied')
  })
})
