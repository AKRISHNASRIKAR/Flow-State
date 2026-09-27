import { evaluatePoll, fetchPollEndpoint, type PollState } from '../../../backend/src/scheduler/poll-change';
import { normalizePollingConfig } from '../../../backend/src/scheduler/polling-config';
import type { Db } from '../db';
import { withDb } from '../db';
import { pollerFor } from '../durable/poller';
import type { Env } from '../env';
import { findTrigger, findTriggerById, listActivePollingTriggers, recordPollingEvent } from '../repo/workflows';
import { admit } from './admission';

export interface PollStateStore {
  read: () => Promise<PollState | null>;
  write: (state: PollState) => Promise<void>;
}

/**
 * One tick of a SCHEDULED trigger — port of the backend PollingWorker.
 * Returns false when the trigger should stop polling (deleted, disabled,
 * workflow no longer on).
 */
export async function pollOnce(env: Env, triggerId: string, store: PollStateStore): Promise<boolean> {
  return withDb(env, async (db) => {
    const trigger = await findTriggerById(db, triggerId);
    if (!trigger || trigger.type !== 'SCHEDULED' || !trigger.enabled || trigger.workflowStatus !== 'ACTIVE') {
      return false;
    }

    let outcome: ReturnType<typeof evaluatePoll>;
    try {
      const config = normalizePollingConfig(trigger.config);
      outcome = evaluatePoll(config, await fetchPollEndpoint(config), await store.read());
    } catch (error) {
      await recordPollingEvent(db, trigger.id, false, undefined, errorMessage(error));
      return true;
    }

    await store.write(outcome.state);

    if (outcome.kind !== 'changed') {
      await recordPollingEvent(db, trigger.id, false);
      return true;
    }

    for (const payload of outcome.payloads) {
      await admit(env, db, { workflowId: trigger.workflowId, payload, source: 'poll' });
    }
    await recordPollingEvent(db, trigger.id, true, outcome.snapshot);
    return true;
  });
}

/**
 * Brings a trigger's poller in line with the database: running for an
 * enabled SCHEDULED trigger on an ACTIVE workflow, stopped otherwise. Call
 * after anything that could change that (trigger saved or deleted, workflow
 * paused, resumed, deleted).
 */
export async function syncTriggerPoller(env: Env, db: Db, triggerId: string): Promise<void> {
  const trigger = await findTriggerById(db, triggerId);
  const poller = pollerFor(env, triggerId);
  if (!trigger || trigger.type !== 'SCHEDULED' || !trigger.enabled || trigger.workflowStatus !== 'ACTIVE') {
    await poller.stop();
    return;
  }
  await poller.start(trigger.id, normalizePollingConfig(trigger.config).interval);
}

export async function syncWorkflowPoller(env: Env, db: Db, workflowId: string): Promise<void> {
  const trigger = await findTrigger(db, workflowId);
  if (trigger) await syncTriggerPoller(env, db, trigger.id);
}

/**
 * Cron safety net: re-arm every poller that should be running. One D1 query
 * for the whole list, then one Durable Object call per trigger — the Free
 * plan allows 50 subrequests per invocation, so this covers ~49 polling
 * workflows. `start` is idempotent, so already-armed pollers are untouched.
 */
export async function reconcilePollers(env: Env): Promise<void> {
  const triggers = await withDb(env, (db) => listActivePollingTriggers(db));
  for (const { id, config } of triggers) {
    try {
      await pollerFor(env, id).start(id, normalizePollingConfig(config).interval);
    } catch (error) {
      console.error(`Couldn’t re-arm poller for trigger ${id}`, error);
    }
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
