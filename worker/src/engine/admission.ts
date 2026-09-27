import {
  MAX_CONCURRENT_EXECUTIONS_PER_WORKFLOW,
  MAX_EXECUTIONS_PER_USER_PER_HOUR,
} from '../../../backend/src/common/limits';
import type { Db } from '../db';
import { now, withDb } from '../db';
import { rateLimiterFor } from '../durable/rate-limiter';
import type { Env } from '../env';
import { countInFlight, createExecution, setEventStatus, setExecution } from '../repo/executions';
import { findTrigger, findWorkflow } from '../repo/workflows';

export interface TriggeredEvent {
  workflowId: string;
  payload: unknown;
  source: 'webhook' | 'manual' | 'poll';
  /** Present for webhook and manual fires — gets the admission outcome. */
  webhookEventId?: string;
}

/**
 * Port of backend TriggeredListener: decide whether a trigger may start a
 * run, and if so record it and start its durable Workflow. The instance id
 * is the execution id, so starting the same execution twice is refused by
 * Cloudflare — the same guarantee BullMQ's `jobId` gave.
 */
export async function admit(env: Env, db: Db, event: TriggeredEvent): Promise<void> {
  const workflow = await findWorkflow(db, event.workflowId);
  if (!workflow || workflow.status !== 'ACTIVE') {
    return markEvent(db, event, 'SKIPPED');
  }

  if ((await countInFlight(db, workflow.id)) >= MAX_CONCURRENT_EXECUTIONS_PER_WORKFLOW) {
    return markEvent(db, event, 'SKIPPED_CONCURRENCY_LIMIT');
  }

  const { allowed } = await rateLimiterFor(env, workflow.userId).consume(MAX_EXECUTIONS_PER_USER_PER_HOUR);
  if (!allowed) {
    return markEvent(db, event, 'SKIPPED_RATE_LIMIT');
  }

  const trigger = await findTrigger(db, workflow.id);
  const executionId = await createExecution(db, {
    workflowId: workflow.id,
    triggerId: trigger?.id ?? null,
    payload: event.payload ?? {},
  });

  try {
    await env.RUN_WORKFLOW.create({ id: executionId, params: { executionId } });
  } catch (error) {
    // Without an instance nothing would ever move this run out of PENDING —
    // fail it visibly instead.
    await setExecution(db, executionId, {
      status: 'FAILED',
      error: `Couldn’t start the run: ${error instanceof Error ? error.message : String(error)}`,
      finishedAt: now(),
    });
    throw error;
  }

  await markEvent(db, event, 'PROCESSED');
}

/**
 * For request handlers: runs admission after the response is sent (ingress
 * never executes), on its own connection — the request's is closed by then.
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
