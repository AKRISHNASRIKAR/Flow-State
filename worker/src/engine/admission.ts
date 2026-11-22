import {
  MAX_CONCURRENT_EXECUTIONS_PER_WORKFLOW,
  MAX_EXECUTIONS_PER_USER_PER_HOUR,
} from '../../../backend/src/common/limits';
import type { Db } from '../db';
import { now, withDb } from '../db';
import { rateLimiterFor } from '../durable/rate-limiter';
import type { Env } from '../env';
import {
  admitExecution,
  countInFlight,
  isEventAdmitted,
  listStalePendingExecutions,
  listStrandedEvents,
  setEventStatus,
  setExecution,
} from '../repo/executions';
import { findTrigger, findWorkflow } from '../repo/workflows';

export interface TriggeredEvent {
  workflowId: string;
  payload: unknown;
  source: 'webhook' | 'manual' | 'poll';
  /** Present for webhook and manual fires - gets the admission outcome. */
  webhookEventId?: string;
}

/**
 * Port of backend TriggeredListener: decide whether a trigger may start a
 * run, and if so record it and start its durable Workflow. The instance id
 * is the execution id, so starting the same execution twice is refused by
 * Cloudflare - the same guarantee BullMQ's `jobId` gave.
 */
export async function admit(env: Env, db: Db, event: TriggeredEvent): Promise<void> {
  const workflow = await findWorkflow(db, event.workflowId);
  if (!workflow || workflow.status !== 'ACTIVE') {
    return markEvent(db, event, 'SKIPPED');
  }

  // Fast path: a full workflow is refused before it spends rate-limit
  // budget. Not authoritative - admitExecution below re-checks atomically.
  if ((await countInFlight(db, workflow.id)) >= MAX_CONCURRENT_EXECUTIONS_PER_WORKFLOW) {
    return markEvent(db, event, 'SKIPPED_CONCURRENCY_LIMIT');
  }

  const { allowed } = await rateLimiterFor(env, workflow.userId).consume(MAX_EXECUTIONS_PER_USER_PER_HOUR);
  if (!allowed) {
    return markEvent(db, event, 'SKIPPED_RATE_LIMIT');
  }

  const trigger = await findTrigger(db, workflow.id);
  const executionId = await admitExecution(db, {
    workflowId: workflow.id,
    triggerId: trigger?.id ?? null,
    payload: event.payload ?? {},
    webhookEventId: event.webhookEventId,
    maxInFlight: MAX_CONCURRENT_EXECUTIONS_PER_WORKFLOW,
  });

  if (!executionId) {
    // Either this event was admitted already (a recovery sweep racing the
    // original), or concurrent triggers filled the workflow since the fast
    // path. Only the second needs recording.
    if (event.webhookEventId && (await isEventAdmitted(db, event.webhookEventId))) return;
    return markEvent(db, event, 'SKIPPED_CONCURRENCY_LIMIT');
  }

  try {
    await env.RUN_WORKFLOW.create({ id: executionId, params: { executionId } });
  } catch (error) {
    // Without an instance nothing would ever move this run out of PENDING -
    // fail it visibly instead.
    await setExecution(db, executionId, {
      status: 'FAILED',
      error: `Couldn’t start the run: ${error instanceof Error ? error.message : String(error)}`,
      finishedAt: now(),
    });
    throw error;
  }
}

/**
 * For request handlers: runs admission after the response is sent (ingress
 * never executes), on its own connection - the request's is closed by then.
 */
export function admitInBackground(
  env: Env,
  ctx: { waitUntil(promise: Promise<unknown>): void },
  event: TriggeredEvent,
) {
  ctx.waitUntil(
    withDb(env, (db) => admit(env, db, event)).catch((error: unknown) => {
      console.error(`Admission failed for workflow ${event.workflowId}`, error);
    }),
  );
}

async function markEvent(db: Db, event: TriggeredEvent, status: string) {
  if (!event.webhookEventId) return;
  await setEventStatus(db, event.webhookEventId, status).catch((error: unknown) => {
    console.error(`Failed to mark webhook event ${event.webhookEventId} as ${status}`, error);
  });
}

// Recovery sweep (cron). Small batches: each admission is about seven
// D1/Durable Object calls, and a Free-plan invocation allows 50.
const STRANDED_AFTER_MS = 2 * 60 * 1000;
const STRANDED_GIVE_UP_MS = 24 * 60 * 60 * 1000;
const STALE_PENDING_AFTER_MS = 10 * 60 * 1000;
const RECOVERY_BATCH = 5;

/**
 * Closes the gap between "acknowledged" and "running": admits webhook
 * deliveries whose background admission never finished, and starts the
 * Workflow instance for PENDING runs that never got one (the isolate died
 * between creating the row and the instance).
 */
export async function recoverStranded(env: Env): Promise<void> {
  await withDb(env, async (db) => {
    const at = Date.now();
    const events = await listStrandedEvents(
      db,
      new Date(at - STRANDED_AFTER_MS).toISOString(),
      new Date(at - STRANDED_GIVE_UP_MS).toISOString(),
      RECOVERY_BATCH,
    );
    for (const e of events) {
      try {
        await admit(env, db, { workflowId: e.workflowId, payload: e.payload, source: 'webhook', webhookEventId: e.id });
      } catch (error) {
        console.error(`Recovery couldn’t admit webhook event ${e.id}`, error);
      }
    }

    const pending = await listStalePendingExecutions(
      db,
      new Date(at - STALE_PENDING_AFTER_MS).toISOString(),
      RECOVERY_BATCH,
    );
    for (const id of pending) {
      try {
        await env.RUN_WORKFLOW.create({ id, params: { executionId: id } });
        console.warn(`Recovery started the missing instance for execution ${id}`);
      } catch {
        // The instance exists (queued, or a retry instance holds the run):
        // nothing was lost.
      }
    }
  });
}
