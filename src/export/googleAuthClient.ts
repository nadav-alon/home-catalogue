/** The upstream project's OAuth client ID. It's public, so it is committed rather than configured per Household. */
export const GOOGLE_OAUTH_CLIENT_ID = '648912727760-c50322ilkhctn2tvjrtp73ahahgbip2b.apps.googleusercontent.com'

/** Limits the app to calendars and events it created itself, rather than the household's whole Calendar. */
export const CALENDAR_APP_CREATED_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created'

interface GisTokenResponse {
  access_token?: string
  error?: string
}

interface GisTokenClient {
  requestAccessToken(): void
}

interface GoogleAccountsOAuth2 {
  initTokenClient(config: {
    client_id: string
    scope: string
    callback: (response: GisTokenResponse) => void
  }): GisTokenClient
}

declare global {
  interface Window {
    google?: { accounts: { oauth2: GoogleAccountsOAuth2 } }
  }
}

export class GoogleIdentityUnavailableError extends Error {}

/**
 * Requests a Calendar access token via Google Identity Services. Must be called synchronously
 * from within the user's tap — the token client's own popup opens inside this call, and browsers
 * block popups opened outside a user gesture.
 */
export function requestCalendarAccessToken(): Promise<string> {
  if (window.google === undefined) {
    return Promise.reject(new GoogleIdentityUnavailableError('Google Identity Services did not load.'))
  }
  const oauth2 = window.google.accounts.oauth2
  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: GOOGLE_OAUTH_CLIENT_ID,
      scope: CALENDAR_APP_CREATED_SCOPE,
      callback: (response) => {
        if (response.access_token !== undefined) resolve(response.access_token)
        else reject(new Error(response.error ?? 'Google did not grant a Calendar access token.'))
      },
    })
    client.requestAccessToken()
  })
}
