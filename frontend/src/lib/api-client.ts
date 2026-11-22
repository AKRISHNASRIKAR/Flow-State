import type { ApiErrorResponse, RefreshResponse } from '@flowstate/api-types';
import { getLegacyRefreshToken, hasStoredSession, useAuthStore } from './auth-store';
import { toast } from './toast';

// Trailing slashes stripped: every path is appended with a leading `/`, and
// `//auth/…` 404s on the API - an easy mistake to make in a hosting dashboard.
// The API's own address: for what leaves the dashboard - webhook URLs shown
// to users, and the Google sign-in navigation.
export const API_URL: string = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/**
 * Every XHR goes through the dashboard's own origin, which next.config.ts
 * rewrites to API_URL. Same-origin is what lets the refresh token be an
 * httpOnly SameSite=Strict cookie the browser attaches by itself.
 */
const API_PROXY_PATH = '/api';

/** statusCode used when the request never got an HTTP response at all. */
export const NETWORK_ERROR_STATUS = 0;

export class ApiError extends Error {
  readonly statusCode: number;
  /** Always an array - validation failures come back as one message per field. */
  readonly messages: string[];

  constructor(body: ApiErrorResponse | null, status: number) {
    const messages =
      body === null ? [`Request failed (${status})`]
      : Array.isArray(body.message) ? body.message
      : [body.message];
    super(messages.join('; '));
    this.statusCode = status;
    this.messages = messages;
  }

  static network(cause: unknown): ApiError {
    const error = new ApiError(
      { error: 'Network error', message: 'Could not reach the API', statusCode: NETWORK_ERROR_STATUS, timestamp: '' },
      NETWORK_ERROR_STATUS,
    );
    error.cause = cause;
    return error;
  }
}

async function parseError(res: Response): Promise<ApiError> {
  let body: ApiErrorResponse | null = null;
  try {
    body = (await res.json()) as ApiErrorResponse;
  } catch {
    // non-JSON error body (proxy, network layer) - fall back to status only
  }
  return new ApiError(body, res.status);
}

/**
 * - ok: new tokens stored.
 * - rejected: the API answered and said no (expired, revoked, already used)
 *   - the session is over.
 * - unreachable: no answer, or a 5xx. The stored token is kept: logging
 *   someone out because their wifi blinked would be wrong, and if the token
 *   really was spent, the next attempt is rejected properly.
 */
type RefreshOutcome = 'ok' | 'rejected' | 'unreachable';

// Single-flight refresh: concurrent 401s share one /auth/refresh call so the
// one-time-use refresh token is only spent once.
let refreshInFlight: Promise<RefreshOutcome> | null = null;

async function refreshSession(): Promise<RefreshOutcome> {
  refreshInFlight ??= (async (): Promise<RefreshOutcome> => {
    // The cookie carries the token. A session from before the cookie still
    // has it in localStorage: sent once, then the API sets the cookie and
    // setAccessToken deletes the stored copy.
    const legacyToken = getLegacyRefreshToken();
    try {
      const res = await fetch(`${API_PROXY_PATH}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(legacyToken === null ? {} : { refreshToken: legacyToken }),
      });
      if (res.status >= 500) return 'unreachable';
      if (!res.ok) return 'rejected';
      const tokens = (await res.json()) as RefreshResponse;
      // The rotated refresh token arrived as a new cookie.
      useAuthStore.getState().setAccessToken(tokens.accessToken);
      return 'ok';
    } catch {
      return 'unreachable';
    }
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/** Attempt a silent session restore from the refresh cookie (app boot). */
export async function bootstrapSession(): Promise<void> {
  const store = useAuthStore.getState();
  if (!hasStoredSession()) {
    store.setBootstrapping(false);
    return;
  }
  store.setBootstrapping(true);
  const outcome = await refreshSession();
  if (outcome === 'rejected') store.clear();
  if (outcome === 'unreachable') store.setUnreachable();
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** Query params - undefined values are dropped. */
  params?: Record<string, string | number | undefined>;
  auth?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}, isRetry = false): Promise<T> {
  const { method = 'GET', body, headers = {}, params, auth = true } = options;

  const url = new URL(`${API_PROXY_PATH}${path}`, window.location.origin);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  const finalHeaders: Record<string, string> = { ...headers };
  if (body !== undefined) finalHeaders['Content-Type'] = 'application/json';
  const { accessToken } = useAuthStore.getState();
  if (auth && accessToken !== null) finalHeaders['Authorization'] = `Bearer ${accessToken}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: finalHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (cause) {
    // fetch only rejects when no HTTP response arrived (offline, DNS, CORS,
    // API down). A typed error lets the UI say so instead of "Failed to fetch".
    throw ApiError.network(cause);
  }

  if (res.status === 401 && auth && !isRetry && !path.startsWith('/auth/')) {
    const outcome = await refreshSession();
    if (outcome === 'ok') return request<T>(path, options, true);
    // Couldn't ask the API - that's a connection problem, not a logout.
    if (outcome === 'unreachable') throw ApiError.network(new Error('Session refresh failed'));
    if (useAuthStore.getState().accessToken !== null) {
      // Keyed so a page firing several requests at once shows this once.
      toast.info('Your session has ended', { description: 'Sign in again to continue.', key: 'session-ended' });
    }
    useAuthStore.getState().clear();
    throw await parseError(res);
  }

  if (!res.ok) throw await parseError(res);
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, params?: RequestOptions['params'], headers?: Record<string, string>) =>
    request<T>(path, { params, headers }),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>(path, { method: 'POST', body, headers }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string, headers?: Record<string, string>) =>
    request<T>(path, { method: 'DELETE', headers }),
  /** Unauthenticated request (public endpoints like /health, /auth/*). */
  public: {
    get: <T>(path: string) => request<T>(path, { auth: false }),
    post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body, auth: false }),
  },
};
