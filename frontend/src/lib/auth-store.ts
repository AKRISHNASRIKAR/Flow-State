import { create } from 'zustand';
import type { AccessTokenPayload } from '@flowstate/api-types';

const REFRESH_TOKEN_KEY = 'flowstate.refreshToken';

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
  setTokens: (accessToken: string, refreshToken: string) => void;
  setBootstrapping: (value: boolean) => void;
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
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

// NOTE: refresh tokens in localStorage are a pragmatic SPA choice while the
// API lives on a separate origin. A production deployment should move this
// server-side (BFF) or to a same-site cookie once API and frontend share a
// domain.
function storeRefreshToken(token: string | null) {
  if (token === null) {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  } else {
    localStorage.setItem(REFRESH_TOKEN_KEY, token);
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  bootstrapping: getStoredRefreshToken() !== null,
  setTokens: (accessToken, refreshToken) => {
    storeRefreshToken(refreshToken);
    set({ accessToken, user: decodeAccessToken(accessToken), bootstrapping: false });
  },
  setBootstrapping: (value) => set({ bootstrapping: value }),
  clear: () => {
    storeRefreshToken(null);
    set({ accessToken: null, user: null, bootstrapping: false });
  },
}));
