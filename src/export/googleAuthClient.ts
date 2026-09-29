declare const accessTokenBrand: unique symbol

/** A Google OAuth access token granted for {@link CALENDAR_APP_CREATED_SCOPE}. */
export type AccessToken = string & { readonly [accessTokenBrand]: true }

export function isAccessToken(value: string): value is AccessToken {
  return value.length > 0
}

export class InvalidAccessTokenError extends Error {}

/** Narrows, or throws {@link InvalidAccessTokenError} naming the offending value. */
export function accessToken(value: string): AccessToken {
  if (!isAccessToken(value)) {
    throw new InvalidAccessTokenError(`Access token must not be empty, got ${JSON.stringify(value)}`)
  }
  return value
}

/** The upstream project's OAuth client ID. It's public, so it is committed rather than configured per Household. */
export const GOOGLE_OAUTH_CLIENT_ID = '648912727760-c50322ilkhctn2tvjrtp73ahahgbip2b.apps.googleusercontent.com'

/** Limits the app to calendars and events it created itself, rather than the household's whole Calendar. */
export const CALENDAR_APP_CREATED_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created'

interface GisTokenResponse {
  access_token?: string
  error?: string
}

/** Reported through `error_callback`, not `callback`, for failures that never reach Google: `popup_closed`, `popup_failed_to_open`, … */
interface GisTokenErrorResponse {
  type: string
  message?: string
}

interface GisTokenClient {
  requestAccessToken(): void
}

interface GoogleAccountsOAuth2 {
  initTokenClient(config: {
    client_id: string
    scope: string
    callback: (response: GisTokenResponse) => void
    error_callback: (error: GisTokenErrorResponse) => void
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
export function requestCalendarAccessToken(): Promise<AccessToken> {
  if (window.google === undefined) {
    return Promise.reject(new GoogleIdentityUnavailableError('Google Identity Services did not load.'))
  }
  const oauth2 = window.google.accounts.oauth2
  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: GOOGLE_OAUTH_CLIENT_ID,
      scope: CALENDAR_APP_CREATED_SCOPE,
      callback: (response) => {
        if (response.access_token !== undefined && isAccessToken(response.access_token)) resolve(response.access_token)
        else reject(new Error(response.error ?? 'Google did not grant a Calendar access token.'))
      },
      error_callback: (error) => {
        reject(new Error(error.message ?? `Google Identity Services failed: ${error.type}`))
      },
    })
    client.requestAccessToken()
  })
}
