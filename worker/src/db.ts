import type { Env } from './env';

/**
 * Cloudflare D1 (SQLite) access. Schema: migrations/ (applied with
 * `wrangler d1 migrations apply`). src/db.test.ts runs every query in
 * src/repo/ against those migrations, so a schema change the queries weren't
 * updated for fails the build.
 *
 * Storage conventions (see migrations/0001_initial.sql):
 * - timestamps are ISO-8601 UTC strings — always `now()` below, never SQL
 *   `CURRENT_TIMESTAMP` (a different format that sorts differently);
 * - JSON columns hold JSON text — write with `json()`, read with `parseJson()`;
 * - booleans are 0/1 — read with `bool()`.
 *
 * D1 has no interactive transactions. Where several writes must land
 * together, send them as one `batch()`, which D1 runs atomically.
 */

const UNIQUE_VIOLATION = /UNIQUE constraint failed/i;

type Param = string | number | boolean | null | undefined;

export class Db {
  constructor(private readonly d1: D1Database) {}

  /** A statement for `batch()`; `undefined` binds as NULL. */
  statement(sql: string, params: Param[] = []): D1PreparedStatement {
    return this.d1.prepare(sql).bind(...params.map((p) => (p === undefined ? null : p)));
  }

  async many<T>(sql: string, params: Param[] = []): Promise<T[]> {
    return (await this.statement(sql, params).all<T>()).results;
  }

  async one<T>(sql: string, params: Param[] = []): Promise<T | undefined> {
    return (await this.statement(sql, params).first<T>()) ?? undefined;
  }

  /** Returns the number of rows changed. */
  async run(sql: string, params: Param[] = []): Promise<number> {
    return (await this.statement(sql, params).run()).meta.changes;
  }

  /** Runs the statements atomically: all apply, or none do. Returns rows changed per statement. */
  async batch(statements: D1PreparedStatement[]): Promise<number[]> {
    if (statements.length === 0) return [];
    return (await this.d1.batch(statements)).map((r) => r.meta.changes);
  }
}

export function dbFor(env: Env): Db {
  return new Db(env.DB);
}

/**
 * For work outside a request (workflow steps, alarms, cron). D1 needs no
 * connection lifecycle, but keeping one entry point keeps call sites uniform.
 */
export function withDb<T>(env: Env, fn: (db: Db) => Promise<T>): Promise<T> {
  return fn(dbFor(env));
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && UNIQUE_VIOLATION.test(error.message);
}

export const now = () => new Date().toISOString();

/** JSON column value. `undefined` → SQL NULL; anything else (including null) → JSON text. */
export function json(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

export function parseJson<T = unknown>(value: string | null | undefined): T | null {
  return value === null || value === undefined ? null : (JSON.parse(value) as T);
}

export const bool = (value: number | boolean | null | undefined) => value === 1 || value === true;
