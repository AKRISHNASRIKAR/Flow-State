import { create } from 'zustand';
import type { AccessTokenPayload } from '@flowstate/api-types';

const REFRESH_TOKEN_KEY = 'flowstate.refreshToken';
const SIGN_IN_NONCE_KEY = 'flowstate.signInNonce';

export interface AuthUser {
  id: string;
  email: string;
}

interface AuthState {
  /** Access token lives in memory only — never persisted. */
  accessToken: string | null;
  user: AuthUser | null;
  /** True until the initial silent-refresh attempt on app boot settles. */
  bootstrapping: boolean;
  /**
   * The boot-time restore couldn't reach the API. The refresh token is still
   * stored, so this is "try again", not "sign in again".
   */
  unreachable: boolean;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setBootstrapping: (value: boolean) => void;
  setUnreachable: () => void;
  clear: () => void;
}

export function decodeAccessToken(token: string): AuthUser | null {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64)) as AccessTokenPayload;
    return { id: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

export function getStoredRefreshToken(): string | null {
  // Guard for Next.js prerendering — there is no localStorage on the server.
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

// NOTE: refresh tokens in localStorage are a pragmatic SPA choice while the
// API lives on a separate origin. A production deployment should move this
// server-side (BFF) or to a same-site cookie once API and frontend share a
// domain.
function storeRefreshToken(token: string | null) {
  if (typeof window === 'undefined') return;
  if (token === null) {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  } else {
    localStorage.setItem(REFRESH_TOKEN_KEY, token);
  }
}

// sessionStorage, not localStorage: the nonce must be scoped to the tab that
// started sign-in, which is exactly what makes it useless to anyone else.
export function createSignInNonce(): string {
  const nonce = crypto.randomUUID();
  sessionStorage.setItem(SIGN_IN_NONCE_KEY, nonce);
  return nonce;
}

/** Read-once: a nonce is spent by the exchange attempt, success or not. */
export function takeSignInNonce(): string | null {
  const nonce = sessionStorage.getItem(SIGN_IN_NONCE_KEY);
  sessionStorage.removeItem(SIGN_IN_NONCE_KEY);
  return nonce;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  bootstrapping: getStoredRefreshToken() !== null,
  unreachable: false,
  setTokens: (accessToken, refreshToken) => {
    storeRefreshToken(refreshToken);
    set({ accessToken, user: decodeAccessToken(accessToken), bootstrapping: false, unreachable: false });
  },
  setBootstrapping: (value) => set({ bootstrapping: value, ...(value ? { unreachable: false } : {}) }),
  setUnreachable: () => set({ bootstrapping: false, unreachable: true }),
  clear: () => {
    storeRefreshToken(null);
    set({ accessToken: null, user: null, bootstrapping: false, unreachable: false });
  },
}));
