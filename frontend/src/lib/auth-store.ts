import { create } from 'zustand';
import type { AccessTokenPayload } from '@flowstate/api-types';

/**
 * Where the refresh token used to be kept, before it moved to an httpOnly
 * cookie. Read once, to migrate a session started before the move.
 */
const LEGACY_REFRESH_TOKEN_KEY = 'flowstate.refreshToken';
/**
 * "This browser has a session": script can't see the httpOnly cookie, so
 * without this flag every visit would pay a refresh request just to learn
 * there is nothing to restore. Not a secret - it unlocks nothing.
 */
const SESSION_HINT_KEY = 'flowstate.session';
const SIGN_IN_NONCE_KEY = 'flowstate.signInNonce';

export interface AuthUser {
  id: string;
  email: string;
}

interface AuthState {
  /** Access token lives in memory only - never persisted. */
  accessToken: string | null;
  user: AuthUser | null;
  /** True until the initial silent-refresh attempt on app boot settles. */
  bootstrapping: boolean;
  /**
   * The boot-time restore couldn't reach the API. The refresh cookie is
   * still there, so this is "try again", not "sign in again".
   */
  unreachable: boolean;
  /** The refresh token itself arrives as a cookie, not through here. */
  setAccessToken: (accessToken: string) => void;
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

/** A pre-cookie refresh token still in localStorage, if any. */
export function getLegacyRefreshToken(): string | null {
  // Guard for Next.js prerendering - there is no localStorage on the server.
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(LEGACY_REFRESH_TOKEN_KEY);
}

/** Whether a silent restore is worth attempting. */
export function hasStoredSession(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(SESSION_HINT_KEY) !== null || getLegacyRefreshToken() !== null;
}

function markSession(active: boolean) {
  if (typeof window === 'undefined') return;
  // Either way the legacy token is done with: migrated, or signed out.
  localStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
  if (active) {
    localStorage.setItem(SESSION_HINT_KEY, '1');
  } else {
    localStorage.removeItem(SESSION_HINT_KEY);
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
  bootstrapping: hasStoredSession(),
  unreachable: false,
  setAccessToken: (accessToken) => {
    markSession(true);
    set({ accessToken, user: decodeAccessToken(accessToken), bootstrapping: false, unreachable: false });
  },
  setBootstrapping: (value) => set({ bootstrapping: value, ...(value ? { unreachable: false } : {}) }),
  setUnreachable: () => set({ bootstrapping: false, unreachable: true }),
  clear: () => {
    markSession(false);
    set({ accessToken: null, user: null, bootstrapping: false, unreachable: false });
  },
}));
