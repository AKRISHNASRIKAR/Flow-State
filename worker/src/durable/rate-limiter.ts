import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env';

const HOUR_MS = 60 * 60 * 1000;

const bucketKey = (at = Date.now()) => `hour:${Math.floor(at / HOUR_MS)}`;

/**
 * The per-user hourly run limit, one instance per user. Replaces Redis
 * INCR + EXPIRE: a Durable Object processes one call at a time, so two
 * concurrent triggers can't both slip under the limit.
 */
export class RateLimiter extends DurableObject<Env> {
  /**
   * Counts one run against the current hour. Counts even when over the
   * limit — same as the backend — so a flood keeps being refused until the
   * window rolls over.
   */
  async consume(limit: number): Promise<{ allowed: boolean; used: number }> {
    const key = bucketKey();
    const used = ((await this.ctx.storage.get<number>(key)) ?? 0) + 1;
    await this.ctx.storage.put(key, used);
    if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(Date.now() + HOUR_MS);
    }
    return { allowed: used <= limit, used };
  }

  async used(): Promise<number> {
    return (await this.ctx.storage.get<number>(bucketKey())) ?? 0;
  }

  /** Forgets past hours so storage doesn't grow forever. */
  async alarm(): Promise<void> {
    const current = bucketKey();
    const keys = [...(await this.ctx.storage.list()).keys()].filter((k) => k !== current);
    if (keys.length > 0) await this.ctx.storage.delete(keys);
    if ((await this.ctx.storage.get(current)) !== undefined) {
      await this.ctx.storage.setAlarm(Date.now() + HOUR_MS);
    }
  }
}

export function rateLimiterFor(env: Env, userId: string) {
  return env.RATE_LIMITER.get(env.RATE_LIMITER.idFromName(userId));
}
