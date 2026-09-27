import { timingSafeEqual } from 'node:crypto';
import {
  GOOGLE_AUTHORIZE_URL,
  GOOGLE_TOKEN_URL,
  type GoogleIdentity,
  type GoogleTokenResponse,
  SIGN_IN_SCOPES,
  isGoogleTokenResponse,
  pkceChallenge,
  randomToken,
  readIdTokenFromTokenEndpoint,
  sanitizeReturnTo,
} from '../../../backend/src/auth/google/google-oauth';
import { TokenCipher } from '../../../backend/src/common/crypto/token-cipher';
import type { Db } from '../db';
import { isUniqueViolation } from '../db';
import { oneTimeStore } from '../durable/one-time-store';
import type { Env } from '../env';
import { unauthorized, unavailable } from '../http';
import {
  findGoogleConnection,
  findUserByEmailWithGoogle,
  insertGoogleConnectionStatement,
  insertUserStatement,
  updateGoogleConnection,
  type GoogleCredentials,
} from '../repo/auth';
import { audit } from '../repo/executions';
import { startSession } from './session';

/**
 * Port of backend GoogleAuthService — same flow, same error codes, same
 * shared helpers; see that file for the design (PKCE, handoff code, nonce as
 * the login-CSRF defence). Redis GETDEL becomes the OneTimeStore DO.
 */

const STATE_TTL_SECONDS = 10 * 60;
const HANDOFF_TTL_SECONDS = 60;
const TOKEN_EXCHANGE_TIMEOUT_MS = 10_000;
const MIN_NONCE_LENGTH = 16;

type SignInError = 'access_denied' | 'state_expired' | 'email_unverified' | 'account_conflict' | 'google_failed';

class SignInFailure extends Error {
  constructor(readonly code: SignInError) {
    super(code);
  }
}

interface PendingSignIn {
  codeVerifier: string;
  returnTo: string;
  nonce: string;
}

function requireConfig(env: Env) {
  const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret, CREDENTIALS_ENCRYPTION_KEY: key } = env;
  // Checked per request so a missing Google setup disables sign-in with a
  // clear message instead of failing the whole Worker.
  if (!clientId || !clientSecret || !key) {
    throw unavailable(
      'Google sign-in is not configured: set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and CREDENTIALS_ENCRYPTION_KEY',
    );
  }
  try {
    return { clientId, clientSecret, cipher: new TokenCipher(key) };
  } catch (error) {
    throw unavailable(error instanceof Error ? error.message : 'Invalid encryption key');
  }
}

export async function buildAuthorizationUrl(env: Env, returnTo: unknown, nonce: unknown): Promise<string> {
  const { clientId } = requireConfig(env);
  if (typeof nonce !== 'string' || nonce.length < MIN_NONCE_LENGTH) {
    throw unauthorized('A sign-in nonce is required');
  }

  const state = randomToken();
  const codeVerifier = randomToken();
  const pending: PendingSignIn = { codeVerifier, returnTo: sanitizeReturnTo(returnTo), nonce };
  await oneTimeStore(env).put(`state:${state}`, JSON.stringify(pending), STATE_TTL_SECONDS);

  const url = new URL(GOOGLE_AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: SIGN_IN_SCOPES.join(' '),
    state,
    code_challenge: pkceChallenge(codeVerifier),
    code_challenge_method: 'S256',
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'select_account',
  }).toString();
  return url.toString();
}

/** Always resolves to a dashboard URL: /auth/callback on success, /login?error= otherwise. */
export async function handleCallback(env: Env, db: Db, query: Record<string, string | undefined>): Promise<string> {
  try {
    if (query.error) throw new SignInFailure('access_denied');
    if (!query.state || !query.code) throw new SignInFailure('state_expired');

    const raw = await oneTimeStore(env).take(`state:${query.state}`);
    if (!raw) throw new SignInFailure('state_expired');
    const pending = JSON.parse(raw) as PendingSignIn;

    const tokens = await exchangeCode(env, query.code, pending.codeVerifier);
    const identity = readIdTokenFromTokenEndpoint(tokens.id_token, requireConfig(env).clientId);
    if (!identity.emailVerified) throw new SignInFailure('email_unverified');

    const { userId, event } = await upsertUser(env, db, identity, tokens);
    if (event) {
      await audit(db, userId, event.action, { entityType: 'users', entityId: userId, event: event.name });
    }

    const handoff = randomToken();
    await oneTimeStore(env).put(
      `handoff:${handoff}`,
      JSON.stringify({ userId, nonce: pending.nonce }),
      HANDOFF_TTL_SECONDS,
    );

    const url = new URL('/auth/callback', env.FRONTEND_URL);
    url.searchParams.set('code', handoff);
    url.searchParams.set('returnTo', pending.returnTo);
    return url.toString();
  } catch (error) {
    const code = error instanceof SignInFailure ? error.code : 'google_failed';
    if (code === 'google_failed') {
      console.error(`Google sign-in failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    const url = new URL('/login', env.FRONTEND_URL);
    url.searchParams.set('error', code);
    return url.toString();
  }
}

export async function exchangeHandoff(env: Env, db: Db, code: string, nonce: string) {
  const raw = await oneTimeStore(env).take(`handoff:${code}`);
  const handoff = raw ? (JSON.parse(raw) as { userId: string; nonce: string }) : null;
  if (!handoff || !safeEqual(handoff.nonce, nonce)) {
    throw unauthorized('Sign-in link is invalid or expired');
  }
  return startSession(db, env, handoff.userId);
}

async function exchangeCode(env: Env, code: string, codeVerifier: string): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret } = requireConfig(env);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TOKEN_EXCHANGE_TIMEOUT_MS);
  try {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: env.GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
      }),
      signal: controller.signal,
    });
    const body: unknown = await response.json();
    if (!response.ok || !isGoogleTokenResponse(body)) {
      throw new Error(`Token exchange failed with HTTP ${response.status}`);
    }
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Returning Google account → its user; else link a pre-Google account with
 * the same verified email; else create a user. A concurrent first sign-in
 * loses the unique-constraint race, retries once, and takes the "returning"
 * path.
 */
async function upsertUser(
  env: Env,
  db: Db,
  identity: GoogleIdentity,
  tokens: GoogleTokenResponse,
): Promise<{ userId: string; event?: { action: string; name: string } }> {
  const { cipher } = requireConfig(env);
  const creds: GoogleCredentials = {
    email: identity.email,
    scopes: tokens.scope.split(' ').filter(Boolean),
    accessTokenEnc: cipher.encrypt(tokens.access_token),
    accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    // Google only returns a refresh token on first consent — keep the stored one.
    refreshTokenEnc: tokens.refresh_token ? cipher.encrypt(tokens.refresh_token) : undefined,
  };

  // No interactive transactions on D1, so the unique constraints on
  // connections (provider+account, user+provider) and users(email) are what
  // keep this consistent: a racing insert fails, and the retry sees the winner.
  for (let attempt = 0; ; attempt++) {
    try {
      const existing = await findGoogleConnection(db, identity.sub);
      if (existing) {
        await updateGoogleConnection(db, existing.id, creds);
        return { userId: existing.userId };
      }

      const byEmail = await findUserByEmailWithGoogle(db, identity.email);
      if (byEmail) {
        // Tied to a *different* Google account — never silently re-point it.
        if (byEmail.hasGoogle) throw new SignInFailure('account_conflict');
        await db.batch([insertGoogleConnectionStatement(db, byEmail.id, identity.sub, creds)]);
        return { userId: byEmail.id, event: { action: 'UPDATE', name: 'auth.google.linked' } };
      }

      // User and connection together, atomically — never a user without one.
      const userId = crypto.randomUUID();
      await db.batch([
        insertUserStatement(db, userId, identity.email, identity.name),
        insertGoogleConnectionStatement(db, userId, identity.sub, creds),
      ]);
      return { userId, event: { action: 'CREATE', name: 'auth.google.registered' } };
    } catch (error) {
      if (!isUniqueViolation(error) || attempt > 0) throw error;
    }
  }
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
