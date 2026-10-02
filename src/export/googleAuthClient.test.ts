import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CALENDAR_APP_CREATED_SCOPE,
  GOOGLE_OAUTH_CLIENT_ID,
  GoogleIdentityUnavailableError,
  GoogleSignInCancelledError,
  GoogleSignInPopupBlockedError,
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

  it('rejects as cancelled when the user closes the popup, via error_callback rather than callback', async () => {
    window.google = {
      accounts: {
        oauth2: {
          initTokenClient: (config) => ({
            requestAccessToken: () => config.error_callback({ type: 'popup_closed' }),
          }),
        },
      },
    }

    await expect(requestCalendarAccessToken()).rejects.toBeInstanceOf(GoogleSignInCancelledError)
  })

  it('rejects as popup-blocked when the browser refuses to open the popup', async () => {
    window.google = {
      accounts: {
        oauth2: {
          initTokenClient: (config) => ({
            requestAccessToken: () => config.error_callback({ type: 'popup_failed_to_open' }),
          }),
        },
      },
    }

    await expect(requestCalendarAccessToken()).rejects.toBeInstanceOf(GoogleSignInPopupBlockedError)
  })

  it('rejects with a plain error, neither cancelled nor popup-blocked, for any other error_callback type', async () => {
    window.google = {
      accounts: {
        oauth2: {
          initTokenClient: (config) => ({
            requestAccessToken: () => config.error_callback({ type: 'unknown' }),
          }),
        },
      },
    }

    const rejection = await requestCalendarAccessToken().catch((err: unknown) => err)

    expect(rejection).toBeInstanceOf(Error)
    expect(rejection).not.toBeInstanceOf(GoogleSignInCancelledError)
    expect(rejection).not.toBeInstanceOf(GoogleSignInPopupBlockedError)
  })
})
