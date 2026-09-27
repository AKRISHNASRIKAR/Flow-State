import { sign, verify } from 'hono/jwt';
import { hashRefreshToken, refreshTokenMatches } from '../../../backend/src/auth/refresh-token-hash';
import type { Db } from '../db';
import type { Env } from '../env';
import { unauthorized } from '../http';
import {
  findRefreshToken,
  findUser,
  insertRefreshTokenStatement,
  linkReplacementStatement,
  revokeRefreshToken,
} from '../repo/auth';
import { audit } from '../repo/executions';

/**
 * Port of backend AuthService. Same claims, same HS256 secrets, same TTLs as
 * NestJS's JwtService, and the same SHA-256 refresh-token hash — so a session
 * started on either backend keeps working on the other during the move.
 */

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const ALG = 'HS256';

export interface AccessTokenPayload {
  sub: string;
  email: string;
}

/** Signs a pair and returns the statement that stores the refresh token, so callers can batch it. */
async function signTokenPair(db: Db, env: Env, user: { id: string; email: string }) {
  const iat = Math.floor(Date.now() / 1000);
  const refreshTokenId = crypto.randomUUID();
  const accessToken = await sign(
    { sub: user.id, email: user.email, iat, exp: iat + ACCESS_TOKEN_TTL_SECONDS },
    env.JWT_ACCESS_SECRET,
    ALG,
  );
  const refreshToken = await sign(
    { sub: user.id, email: user.email, jti: refreshTokenId, iat, exp: iat + REFRESH_TOKEN_TTL_SECONDS },
    env.JWT_REFRESH_SECRET,
    ALG,
  );

  const store = insertRefreshTokenStatement(db, {
    id: refreshTokenId,
    userId: user.id,
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt: new Date((iat + REFRESH_TOKEN_TTL_SECONDS) * 1000).toISOString(),
  });

  return { accessToken, refreshToken, refreshTokenId, store };
}

const toAuthResponse = (pair: { accessToken: string; refreshToken: string }) => ({
  accessToken: pair.accessToken,
  refreshToken: pair.refreshToken,
  tokenType: 'Bearer' as const,
  expiresIn: ACCESS_TOKEN_TTL_SECONDS,
});

/** Called once identity is established (end of Google sign-in). */
export async function startSession(db: Db, env: Env, userId: string) {
  const user = await findUser(db, userId);
  if (!user) throw unauthorized('Account no longer exists');
  await audit(db, user.id, 'LOGIN', { entityType: 'users', entityId: user.id });
  const pair = await signTokenPair(db, env, user);
  await db.batch([pair.store]);
  return toAuthResponse(pair);
}

async function verifyRefreshToken(env: Env, token: string) {
  try {
    const payload = await verify(token, env.JWT_REFRESH_SECRET, ALG);
    if (typeof payload.sub !== 'string' || typeof payload.jti !== 'string') throw new Error('bad claims');
    return { sub: payload.sub, jti: payload.jti };
  } catch {
    throw unauthorized('Invalid refresh token');
  }
}

export async function refreshSession(db: Db, env: Env, refreshToken: string) {
  const { jti } = await verifyRefreshToken(env, refreshToken);
  const stored = await findRefreshToken(db, jti);
  if (
    !stored ||
    stored.revokedAt ||
    stored.expiresAt <= new Date().toISOString() ||
    !refreshTokenMatches(refreshToken, stored.tokenHash)
  ) {
    throw unauthorized('Invalid refresh token');
  }

  // Spend the old token first, and only if it's still live: when two
  // refreshes race on one token, exactly one sees a change and continues.
  if ((await revokeRefreshToken(db, stored.id)) === 0) {
    throw unauthorized('Invalid refresh token');
  }
  // Then store the new token and chain the old one to it, atomically (the
  // chain's foreign key needs the new row to exist first).
  const pair = await signTokenPair(db, env, { id: stored.userId, email: stored.email });
  await db.batch([pair.store, linkReplacementStatement(db, stored.id, pair.refreshTokenId)]);

  await audit(db, stored.userId, 'TOKEN_REFRESH', { entityType: 'refresh_tokens', entityId: stored.id });
  return { accessToken: pair.accessToken, refreshToken: pair.refreshToken };
}

export async function endSession(db: Db, env: Env, userId: string, refreshToken: string) {
  const { sub, jti } = await verifyRefreshToken(env, refreshToken);
  if (sub !== userId) throw unauthorized('Invalid refresh token');
  await revokeRefreshToken(db, jti, userId);
  await audit(db, userId, 'LOGOUT', { entityType: 'users', entityId: userId });
  return { success: true };
}

export async function verifyAccessToken(env: Env, token: string): Promise<AccessTokenPayload> {
  const payload = await verify(token, env.JWT_ACCESS_SECRET, ALG);
  if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
    throw new Error('Access token is missing claims');
  }
  return { sub: payload.sub, email: payload.email };
}
