import type { ApiErrorResponse, RefreshResponse } from '@flowstate/api-types';
import { getStoredRefreshToken, useAuthStore } from './auth-store';

export const API_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000';

export class ApiError extends Error {
  readonly statusCode: number;
  /** Always an array — validation failures come back as one message per field. */
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
}

async function parseError(res: Response): Promise<ApiError> {
  let body: ApiErrorResponse | null = null;
  try {
    body = (await res.json()) as ApiErrorResponse;
  } catch {
    // non-JSON error body (proxy, network layer) — fall back to status only
  }
  return new ApiError(body, res.status);
}

// Single-flight refresh: concurrent 401s share one /auth/refresh call so the
// one-time-use refresh token is only spent once.
let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    const refreshToken = getStoredRefreshToken();
    if (refreshToken === null) return false;
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      const tokens = (await res.json()) as RefreshResponse;
      // The backend rotates refresh tokens — always store the NEW one.
      useAuthStore.getState().setTokens(tokens.accessToken, tokens.refreshToken);
      return true;
    } catch {
      return false;
    }
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/** Attempt a silent session restore from the stored refresh token (app boot). */
export async function bootstrapSession(): Promise<void> {
  const store = useAuthStore.getState();
  if (getStoredRefreshToken() === null) {
    store.setBootstrapping(false);
    return;
  }
  const ok = await refreshSession();
  if (!ok) store.clear();
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** Query params — undefined values are dropped. */
  params?: Record<string, string | number | undefined>;
  auth?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}, isRetry = false): Promise<T> {
  const { method = 'GET', body, headers = {}, params, auth = true } = options;

  const url = new URL(`${API_URL}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  const finalHeaders: Record<string, string> = { ...headers };
  if (body !== undefined) finalHeaders['Content-Type'] = 'application/json';
  const { accessToken } = useAuthStore.getState();
  if (auth && accessToken !== null) finalHeaders['Authorization'] = `Bearer ${accessToken}`;

  const res = await fetch(url, {
    method,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && auth && !isRetry && !path.startsWith('/auth/')) {
    const refreshed = await refreshSession();
    if (refreshed) return request<T>(path, options, true);
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
