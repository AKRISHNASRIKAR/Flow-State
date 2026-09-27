import { DurableObject } from 'cloudflare:workers';
import type { PollState } from '../../../backend/src/scheduler/poll-change';
import type { Env } from '../env';
import { pollOnce } from '../engine/polling';

interface PollerConfig {
  triggerId: string;
  intervalSeconds: number;
}

const CONFIG_KEY = 'config';
const STATE_KEY = 'state';

/**
 * One per SCHEDULED trigger (addressed by trigger id). Its alarm is the
 * polling timer and its storage holds the last-seen state — replacing
 * BullMQ repeatable jobs and the Redis `poll:state:*` keys.
 *
 * Alarms rather than Cron Triggers because Cron's finest granularity is one
 * minute and FlowState allows 30-second polling.
 */
export class Poller extends DurableObject<Env> {
  /** Idempotent: safe to call on every trigger save and from the reconcile cron. */
  async start(triggerId: string, intervalSeconds: number): Promise<void> {
    const current = await this.ctx.storage.get<PollerConfig>(CONFIG_KEY);
    await this.ctx.storage.put(CONFIG_KEY, { triggerId, intervalSeconds } satisfies PollerConfig);

    const alarm = await this.ctx.storage.getAlarm();
    if (alarm === null || current?.intervalSeconds !== intervalSeconds) {
      await this.ctx.storage.setAlarm(Date.now() + intervalSeconds * 1000);
    }
  }

  async stop(): Promise<void> {
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  async alarm(): Promise<void> {
    const config = await this.ctx.storage.get<PollerConfig>(CONFIG_KEY);
    if (!config) return;

    let keepPolling = true;
    try {
      keepPolling = await pollOnce(this.env, config.triggerId, {
        read: () => this.ctx.storage.get<PollState>(STATE_KEY).then((s) => s ?? null),
        write: (state) => this.ctx.storage.put(STATE_KEY, state),
      });
    } catch (error) {
      // A failed poll (DB unreachable, …) must not end the schedule — the
      // next tick tries again. pollOnce already records endpoint errors.
      console.error(`Poll failed for trigger ${config.triggerId}`, error);
    }

    if (keepPolling) {
      await this.ctx.storage.setAlarm(Date.now() + config.intervalSeconds * 1000);
    } else {
      await this.stop();
    }
  }
}

export function pollerFor(env: Env, triggerId: string) {
  return env.POLLER.get(env.POLLER.idFromName(triggerId));
}
