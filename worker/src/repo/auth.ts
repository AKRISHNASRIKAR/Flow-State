import type { TelegramUserRecord } from '../../../backend/src/telegram/telegram-bot';
import type { Db } from '../db';
import { bool, json, now } from '../db';

// Mirrors the NestJS backend's auth + telegram queries.

export function findUser(db: Db, id: string) {
  return db.one<{ id: string; email: string }>('SELECT id, email FROM users WHERE id = ?1', [id]);
}

// --- refresh tokens ----------------------------------------------------

export function insertRefreshTokenStatement(
  db: Db,
  token: { id: string; userId: string; tokenHash: string; expiresAt: string },
) {
  return db.statement(
    `INSERT INTO refresh_tokens (id, token_hash, user_id, expires_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5)`,
    [token.id, token.tokenHash, token.userId, token.expiresAt, now()],
  );
}

export function findRefreshToken(db: Db, id: string) {
  return db.one<{
    id: string;
    userId: string;
    email: string;
    tokenHash: string;
    expiresAt: string;
    revokedAt: string | null;
  }>(
    `SELECT r.id, r.user_id AS userId, u.email, r.token_hash AS tokenHash,
       r.expires_at AS expiresAt, r.revoked_at AS revokedAt
     FROM refresh_tokens r JOIN users u ON u.id = r.user_id WHERE r.id = ?1`,
    [id],
  );
}

/**
 * Revokes the token only if it's still live; returns rows changed. 0 means
 * someone else already spent it — the caller refuses, so two refreshes racing
 * on one token can't both succeed.
 */
export function revokeRefreshToken(db: Db, id: string, userId?: string) {
  return db.run(
    `UPDATE refresh_tokens SET revoked_at = ?2 WHERE id = ?1 AND revoked_at IS NULL AND (?3 IS NULL OR user_id = ?3)`,
    [id, now(), userId],
  );
}

/** Records which token replaced a revoked one (the rotation chain). */
export function linkReplacementStatement(db: Db, oldId: string, newId: string) {
  return db.statement('UPDATE refresh_tokens SET replaced_by_token_id = ?2 WHERE id = ?1', [oldId, newId]);
}

// --- Google identity (connections) ------------------------------------

export interface GoogleCredentials {
  email: string;
  scopes: string[];
  accessTokenEnc: string;
  accessTokenExpiresAt: string;
  /** Only present when Google returned one — otherwise the stored token is kept. */
  refreshTokenEnc?: string;
}

export function findGoogleConnection(db: Db, providerAccountId: string) {
  return db.one<{ id: string; userId: string }>(
    `SELECT id, user_id AS userId FROM connections WHERE provider = 'GOOGLE' AND provider_account_id = ?1`,
    [providerAccountId],
  );
}

export function updateGoogleConnection(db: Db, id: string, creds: GoogleCredentials) {
  return db.run(
    `UPDATE connections SET email = ?2, scopes = ?3, access_token_enc = ?4, access_token_expires_at = ?5,
       refresh_token_enc = COALESCE(?6, refresh_token_enc), status = 'ACTIVE', updated_at = ?7
     WHERE id = ?1`,
    [
      id,
      creds.email,
      json(creds.scopes),
      creds.accessTokenEnc,
      creds.accessTokenExpiresAt,
      creds.refreshTokenEnc,
      now(),
    ],
  );
}

export function insertGoogleConnectionStatement(
  db: Db,
  userId: string,
  providerAccountId: string,
  creds: GoogleCredentials,
) {
  return db.statement(
    `INSERT INTO connections (id, user_id, provider, provider_account_id, email, scopes,
       access_token_enc, refresh_token_enc, access_token_expires_at, status, created_at, updated_at)
     VALUES (?1, ?2, 'GOOGLE', ?3, ?4, ?5, ?6, ?7, ?8, 'ACTIVE', ?9, ?9)`,
    [
      crypto.randomUUID(),
      userId,
      providerAccountId,
      creds.email,
      json(creds.scopes),
      creds.accessTokenEnc,
      creds.refreshTokenEnc,
      creds.accessTokenExpiresAt,
      now(),
    ],
  );
}

export async function findUserByEmailWithGoogle(db: Db, email: string) {
  const row = await db.one<{ id: string; hasGoogle: number }>(
    `SELECT u.id, EXISTS (SELECT 1 FROM connections c WHERE c.user_id = u.id AND c.provider = 'GOOGLE') AS hasGoogle
     FROM users u WHERE u.email = ?1`,
    [email],
  );
  return row && { id: row.id, hasGoogle: bool(row.hasGoogle) };
}

export function insertUserStatement(db: Db, id: string, email: string, name: string | undefined) {
  const at = now();
  return db.statement('INSERT INTO users (id, email, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)', [
    id,
    email,
    name,
    at,
  ]);
}

// --- Telegram ------------------------------------------------------------

/** Re-activates a user who had previously blocked the bot. */
export function upsertTelegramUser(db: Db, user: TelegramUserRecord) {
  const at = now();
  return db.run(
    `INSERT INTO telegram_users (id, telegram_id, chat_id, username, first_name, last_name, language_code,
       is_active, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8, ?8)
     ON CONFLICT (telegram_id) DO UPDATE SET chat_id = excluded.chat_id, username = excluded.username,
       first_name = excluded.first_name, last_name = excluded.last_name, language_code = excluded.language_code,
       is_active = 1, updated_at = excluded.updated_at`,
    [
      crypto.randomUUID(),
      user.telegramId,
      user.chatId,
      user.username,
      user.firstName,
      user.lastName,
      user.languageCode,
      at,
    ],
  );
}
