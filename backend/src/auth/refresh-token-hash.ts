import { createHash, timingSafeEqual } from 'crypto';

/**
 * Refresh tokens are stored as a SHA-256 digest, not argon2.
 *
 * argon2's deliberate slowness exists to make guessing *low-entropy*
 * secrets (passwords) expensive. A refresh token is a signed JWT carrying a
 * random 122-bit jti — there is nothing to guess, so a fast digest is just as
 * safe, and it runs anywhere (argon2 is a native module Cloudflare Workers
 * can't load). Shared with the Cloudflare worker so both backends produce and
 * accept the same hashes during the migration.
 *
 * Framework-free on purpose: this file is imported by worker/.
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function refreshTokenMatches(
  token: string,
  storedHash: string,
): boolean {
  const actual = Buffer.from(hashRefreshToken(token), 'hex');
  const expected = Buffer.from(storedHash, 'hex');
  // A pre-migration argon2 hash isn't hex of the right length, so it simply
  // never matches — that session ends and the user signs in again once.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
