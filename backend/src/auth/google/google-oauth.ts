import { createHash, randomBytes } from 'crypto';

export const GOOGLE_AUTHORIZE_URL =
  'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

/**
 * Sign-in asks only for identity. Gmail / Sheets / Calendar scopes are
 * requested incrementally when a user first adds an action that needs them,
 * so signing in never triggers Google's sensitive-scope consent screen.
 */
export const SIGN_IN_SCOPES = ['openid', 'email', 'profile'];

const GOOGLE_ISSUERS = new Set([
  'https://accounts.google.com',
  'accounts.google.com',
]);

const DEFAULT_RETURN_TO = '/workflows';

export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  id_token: string;
  token_type: string;
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

/**
 * Only same-origin paths survive — `//evil.com` and `/\evil.com` are
 * protocol-relative to a browser, so they'd turn the post-login redirect
 * into an open redirect.
 */
export function sanitizeReturnTo(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.startsWith('/\\')
  ) {
    return DEFAULT_RETURN_TO;
  }
  return value;
}

export function isGoogleTokenResponse(
  value: unknown,
): value is GoogleTokenResponse {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.access_token === 'string' &&
    typeof v.expires_in === 'number' &&
    typeof v.scope === 'string' &&
    typeof v.id_token === 'string' &&
    (v.refresh_token === undefined || typeof v.refresh_token === 'string')
  );
}

/**
 * Reads the ID token's claims without checking its signature. That's
 * deliberate and spec-sanctioned (OIDC Core §3.1.3.7): this token came
 * straight from Google's token endpoint over TLS in exchange for our client
 * secret, so the channel already authenticates the issuer. Never use this
 * on an ID token that arrived any other way (e.g. from a browser).
 */
export function readIdTokenFromTokenEndpoint(
  idToken: string,
  expectedAudience: string,
  now: Date = new Date(),
): GoogleIdentity {
  const segment = idToken.split('.')[1];
  if (!segment) throw new Error('Malformed ID token');

  const claims: unknown = JSON.parse(
    Buffer.from(segment, 'base64url').toString('utf8'),
  );
  if (typeof claims !== 'object' || claims === null) {
    throw new Error('Malformed ID token');
  }
  const c = claims as Record<string, unknown>;

  if (typeof c.iss !== 'string' || !GOOGLE_ISSUERS.has(c.iss)) {
    throw new Error('ID token has an unexpected issuer');
  }
  if (c.aud !== expectedAudience) {
    throw new Error('ID token was issued for a different client');
  }
  if (typeof c.exp !== 'number' || c.exp * 1000 <= now.getTime()) {
    throw new Error('ID token has expired');
  }
  if (typeof c.sub !== 'string' || typeof c.email !== 'string') {
    throw new Error('ID token is missing sub or email');
  }

  return {
    sub: c.sub,
    email: c.email.toLowerCase(),
    emailVerified: c.email_verified === true,
    name: typeof c.name === 'string' ? c.name : undefined,
  };
}
