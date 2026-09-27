import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env';

const PURGE_INTERVAL_MS = 60 * 60 * 1000;

interface Entry {
  value: string;
  expiresAt: number;
}

/**
 * Single-use values with a TTL: Google sign-in state (10 min) and the
 * dashboard handoff code (60 s). Replaces Redis GETDEL.
 *
 * Not KV: KV is eventually consistent, so two requests could both read a
 * code before either delete lands — a sign-in code redeemed twice. A Durable
 * Object runs one event at a time and its storage calls are gated, so
 * `take()`'s read-then-delete is atomic.
 */
export class OneTimeStore extends DurableObject<Env> {
  async put(key: string, value: string, ttlSeconds: number): Promise<void> {
    const entry: Entry = { value, expiresAt: Date.now() + ttlSeconds * 1000 };
    await this.ctx.storage.put(key, entry);
    if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(Date.now() + PURGE_INTERVAL_MS);
    }
  }

  /** Returns the value once, then never again. Expired values return null. */
  async take(key: string): Promise<string | null> {
    const entry = await this.ctx.storage.get<Entry>(key);
    if (!entry) return null;
    await this.ctx.storage.delete(key);
    return entry.expiresAt > Date.now() ? entry.value : null;
  }

  /** Drops abandoned entries (sign-ins never completed) so storage stays small. */
  async alarm(): Promise<void> {
    const entries = await this.ctx.storage.list<Entry>();
    const now = Date.now();
    const expired = [...entries].filter(([, e]) => e.expiresAt <= now).map(([key]) => key);
    if (expired.length > 0) await this.ctx.storage.delete(expired);
    if (entries.size > expired.length) await this.ctx.storage.setAlarm(now + PURGE_INTERVAL_MS);
  }
}

export function oneTimeStore(env: Env) {
  return env.ONE_TIME_STORE.get(env.ONE_TIME_STORE.idFromName('global'));
}
