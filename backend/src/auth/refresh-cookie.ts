/**
 * The refresh token travels in an httpOnly cookie, never in a response
 * body, so script on the dashboard (an XSS) can't read and exfiltrate it.
 *
 * That works because the dashboard reaches the API through its own origin:
 * Next.js rewrites `/api/*` to the API (frontend/next.config.ts), so the
 * cookie is first-party to the dashboard and `SameSite=Strict` holds - no
 * cross-site request can carry it, which is also the CSRF defence for the
 * two endpoints that read it. Framework-free: both runtimes import it.
 */

export const REFRESH_COOKIE_NAME = 'flowstate_rt';

/** The refresh token's own lifetime (7 days on both runtimes). */
export const REFRESH_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

/**
 * As the browser sees it: /api/auth/* on the dashboard's origin. The API
 * itself serves /auth/*, so a request made straight to the API (not through
 * the proxy) carries no cookie at all.
 */
const REFRESH_COOKIE_PATH = '/api/auth';

/**
 * `secure` comes from the request's protocol: production is https end to
 * end, while local development is plain http on localhost, where a Secure
 * cookie wouldn't be stored by every browser.
 */
export function refreshCookie(
  token: string,
  secure: boolean,
  maxAgeSeconds = REFRESH_COOKIE_MAX_AGE_SECONDS,
): string {
  return [
    `${REFRESH_COOKIE_NAME}=${token}`,
    `Path=${REFRESH_COOKIE_PATH}`,
    `Max-Age=${maxAgeSeconds}`,
    'HttpOnly',
    'SameSite=Strict',
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

export function clearedRefreshCookie(secure: boolean): string {
  return refreshCookie('', secure, 0);
}

/** The token from a Cookie header, if present. */
export function readRefreshCookie(
  cookieHeader: string | undefined,
): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === REFRESH_COOKIE_NAME) {
      const token = value.join('=');
      return token === '' ? undefined : token;
    }
  }
  return undefined;
}

/**
 * Which token a refresh or logout acts on. The cookie wins; a token in the
 * body is accepted only for sessions started before the cookie existed
 * (the dashboard then held it in localStorage) and is migrated to a cookie
 * by that one refresh.
 */
export function pickRefreshToken(
  cookieHeader: string | undefined,
  bodyToken: string | undefined,
): string | undefined {
  return readRefreshCookie(cookieHeader) ?? (bodyToken || undefined);
}
