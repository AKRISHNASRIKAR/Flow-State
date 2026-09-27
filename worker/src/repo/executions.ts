import type { Db } from '../db';
import { json, now, parseJson } from '../db';

// Mirrors the NestJS backend's executions + webhooks + audit-log queries.

export type ExecutionStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
export const EXECUTION_STATUSES: ExecutionStatus[] = ['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED'];

export interface ExecutionRow {
  id: string;
  workflowId: string;
  workflowName: string;
  userId: string;
  triggerId: string | null;
  status: ExecutionStatus;
  input: unknown;
  output: unknown;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

type RawExecution = Omit<ExecutionRow, 'input' | 'output'> & { input: string | null; output: string | null };
const toExecution = (r: RawExecution): ExecutionRow => ({
  ...r,
  input: parseJson(r.input),
  output: parseJson(r.output),
});

const EXECUTION_COLS = `e.id, e.workflow_id AS workflowId, w.name AS workflowName, w.user_id AS userId,
  e.trigger_id AS triggerId, e.status, e.input, e.output, e.error,
  e.started_at AS startedAt, e.finished_at AS finishedAt, e.created_at AS createdAt`;

// --- executions --------------------------------------------------------

export async function findExecution(db: Db, id: string) {
  const row = await db.one<RawExecution>(
    `SELECT ${EXECUTION_COLS} FROM workflow_executions e JOIN workflows w ON w.id = e.workflow_id WHERE e.id = ?1`,
    [id],
  );
  return row && toExecution(row);
}

export async function createExecution(
  db: Db,
  input: { workflowId: string; triggerId: string | null; payload: unknown },
) {
  const id = crypto.randomUUID();
  await db.run(
    `INSERT INTO workflow_executions (id, workflow_id, trigger_id, status, input, created_at)
     VALUES (?1, ?2, ?3, 'PENDING', ?4, ?5)`,
    [id, input.workflowId, input.triggerId, json(input.payload ?? {}), now()],
  );
  return id;
}

export async function countInFlight(db: Db, workflowId: string) {
  const row = await db.one<{ n: number }>(
    `SELECT count(*) AS n FROM workflow_executions WHERE workflow_id = ?1 AND status IN ('PENDING', 'RUNNING')`,
    [workflowId],
  );
  return row?.n ?? 0;
}

export async function listExecutions(
  db: Db,
  filter: { userId: string; status?: ExecutionStatus; workflowId?: string; limit: number; offset: number },
) {
  const where = 'w.user_id = ?1 AND (?2 IS NULL OR e.status = ?2) AND (?3 IS NULL OR e.workflow_id = ?3)';
  const params = [filter.userId, filter.status ?? null, filter.workflowId ?? null];
  const rows = await db.many<RawExecution>(
    `SELECT ${EXECUTION_COLS} FROM workflow_executions e JOIN workflows w ON w.id = e.workflow_id
     WHERE ${where} ORDER BY e.created_at DESC LIMIT ?4 OFFSET ?5`,
    [...params, filter.limit, filter.offset],
  );
  const count = await db.one<{ n: number }>(
    `SELECT count(*) AS n FROM workflow_executions e JOIN workflows w ON w.id = e.workflow_id WHERE ${where}`,
    params,
  );
  return { rows: rows.map(toExecution), total: count?.n ?? 0 };
}

export interface ExecutionPatch {
  status?: ExecutionStatus;
  output?: unknown;
  error?: string | null;
  startedAt?: string;
  finishedAt?: string | null;
}

/**
 * Each column is only touched when the caller supplied it, so a partial
 * patch can't null out fields it didn't mention. A statement, so callers can
 * put it in a batch with other writes.
 */
export function setExecutionStatement(db: Db, id: string, patch: ExecutionPatch) {
  return db.statement(
    `UPDATE workflow_executions SET
       status = CASE WHEN ?2 THEN ?3 ELSE status END,
       output = CASE WHEN ?4 THEN ?5 ELSE output END,
       error = CASE WHEN ?6 THEN ?7 ELSE error END,
       started_at = CASE WHEN ?8 THEN ?9 ELSE started_at END,
       finished_at = CASE WHEN ?10 THEN ?11 ELSE finished_at END
     WHERE id = ?1`,
    [
      id,
      patch.status !== undefined ? 1 : 0,
      patch.status,
      patch.output !== undefined ? 1 : 0,
      json(patch.output),
      patch.error !== undefined ? 1 : 0,
      patch.error,
      patch.startedAt !== undefined ? 1 : 0,
      patch.startedAt,
      patch.finishedAt !== undefined ? 1 : 0,
      patch.finishedAt,
    ],
  );
}

export async function setExecution(db: Db, id: string, patch: ExecutionPatch) {
  await db.batch([setExecutionStatement(db, id, patch)]);
}

export async function executionStats(db: Db, userId: string) {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const byStatus = await db.many<{ status: ExecutionStatus; n: number }>(
    `SELECT e.status, count(*) AS n FROM workflow_executions e JOIN workflows w ON w.id = e.workflow_id
     WHERE w.user_id = ?1 GROUP BY e.status`,
    [userId],
  );
  const totals = await db.one<{ total: number; last24h: number }>(
    `SELECT count(*) AS total, count(*) FILTER (WHERE e.created_at >= ?2) AS last24h
     FROM workflow_executions e JOIN workflows w ON w.id = e.workflow_id WHERE w.user_id = ?1`,
    [userId, dayAgo],
  );
  // Same sample the NestJS backend averages over: the latest 500 finished runs.
  const durations = await db.one<{ avg: number | null }>(
    `SELECT CAST(round(avg((julianday(finished_at) - julianday(started_at)) * 86400000)) AS INTEGER) AS avg FROM (
       SELECT e.started_at, e.finished_at FROM workflow_executions e JOIN workflows w ON w.id = e.workflow_id
       WHERE w.user_id = ?1 AND e.started_at IS NOT NULL AND e.finished_at IS NOT NULL
       ORDER BY e.created_at DESC LIMIT 500)`,
    [userId],
  );
  return { byStatus, total: totals?.total ?? 0, last24h: totals?.last24h ?? 0, avgDurationMs: durations?.avg ?? 0 };
}

/** `attemptsMade` = failed step attempts, the closest thing Workflows has to a job attempt count. */
export async function listFailedExecutions(db: Db) {
  const rows = await db.many<RawExecution & { attemptsMade: number }>(
    `SELECT ${EXECUTION_COLS},
       (SELECT count(*) FROM action_executions ae WHERE ae.workflow_execution_id = e.id AND ae.status = 'FAILED') AS attemptsMade
     FROM workflow_executions e JOIN workflows w ON w.id = e.workflow_id
     WHERE e.status = 'FAILED' ORDER BY e.finished_at DESC NULLS LAST LIMIT 100`,
  );
  return rows.map((r) => ({ ...toExecution(r), attemptsMade: r.attemptsMade }));
}

// --- steps (action_executions) ----------------------------------------

export async function listSteps(db: Db, executionId: string) {
  const rows = await db.many<{
    id: string;
    actionId: string;
    status: ExecutionStatus;
    input: string | null;
    output: string | null;
    error: string | null;
    startedAt: string | null;
    finishedAt: string | null;
  }>(
    `SELECT id, action_id AS actionId, status, input, output, error,
       started_at AS startedAt, finished_at AS finishedAt
     FROM action_executions WHERE workflow_execution_id = ?1 ORDER BY created_at ASC`,
    [executionId],
  );
  return rows.map((r) => ({ ...r, input: parseJson(r.input), output: parseJson(r.output) }));
}

export async function succeededActionIds(db: Db, executionId: string) {
  const rows = await db.many<{ actionId: string }>(
    `SELECT DISTINCT action_id AS actionId FROM action_executions
     WHERE workflow_execution_id = ?1 AND status = 'SUCCEEDED'`,
    [executionId],
  );
  return rows.map((r) => r.actionId);
}

export async function startStep(db: Db, executionId: string, actionId: string, input: unknown) {
  const id = crypto.randomUUID();
  const at = now();
  await db.run(
    `INSERT INTO action_executions (id, workflow_execution_id, action_id, status, input, started_at, created_at)
     VALUES (?1, ?2, ?3, 'RUNNING', ?4, ?5, ?5)`,
    [id, executionId, actionId, json(input), at],
  );
  return id;
}

export function finishStepStatement(
  db: Db,
  stepId: string,
  result: { status: 'SUCCEEDED'; output: unknown } | { status: 'FAILED'; error: string },
) {
  return db.statement(
    `UPDATE action_executions SET status = ?2, output = ?3, error = ?4, finished_at = ?5 WHERE id = ?1`,
    [
      stepId,
      result.status,
      result.status === 'SUCCEEDED' ? json(result.output ?? {}) : null,
      result.status === 'FAILED' ? result.error : null,
      now(),
    ],
  );
}

export async function finishStep(
  db: Db,
  stepId: string,
  result: { status: 'SUCCEEDED'; output: unknown } | { status: 'FAILED'; error: string },
) {
  await db.batch([finishStepStatement(db, stepId, result)]);
}

// --- webhook events ----------------------------------------------------

export interface WebhookEventRow {
  id: string;
  workflowId: string;
  payload: unknown;
  receivedAt: string;
  status: string;
  idempotencyKey: string | null;
  createdAt: string;
}

const EVENT_COLS = `id, workflow_id AS workflowId, payload, received_at AS receivedAt, status,
  idempotency_key AS idempotencyKey, created_at AS createdAt`;

export function findEventByKey(db: Db, workflowId: string, idempotencyKey: string) {
  return db.one<{ id: string }>('SELECT id FROM webhook_events WHERE workflow_id = ?1 AND idempotency_key = ?2', [
    workflowId,
    idempotencyKey,
  ]);
}

/** Throws a unique violation when (workflow_id, idempotency_key) already exists — the dedup guarantee. */
export async function createEvent(
  db: Db,
  input: { workflowId: string; payload: unknown; status: string; idempotencyKey: string | null },
) {
  const id = crypto.randomUUID();
  const at = now();
  await db.run(
    `INSERT INTO webhook_events (id, workflow_id, payload, received_at, status, idempotency_key, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?4)`,
    [id, input.workflowId, json(input.payload), at, input.status, input.idempotencyKey],
  );
  return id;
}

export function setEventStatus(db: Db, id: string, status: string) {
  return db.run('UPDATE webhook_events SET status = ?2 WHERE id = ?1', [id, status]);
}

export async function listEvents(
  db: Db,
  filter: { workflowId: string; status?: string; limit: number; offset: number },
) {
  const where = 'workflow_id = ?1 AND (?2 IS NULL OR status = ?2)';
  const params = [filter.workflowId, filter.status ?? null];
  const rows = await db.many<Omit<WebhookEventRow, 'payload'> & { payload: string }>(
    `SELECT ${EVENT_COLS} FROM webhook_events WHERE ${where} ORDER BY received_at DESC LIMIT ?3 OFFSET ?4`,
    [...params, filter.limit, filter.offset],
  );
  const count = await db.one<{ n: number }>(`SELECT count(*) AS n FROM webhook_events WHERE ${where}`, params);
  return {
    rows: rows.map((r): WebhookEventRow => ({ ...r, payload: parseJson(r.payload) })),
    total: count?.n ?? 0,
  };
}

// --- audit log ---------------------------------------------------------

/**
 * Never throws — a logging failure must not abort the operation being
 * audited (same contract as the backend's AuditLogService).
 */
export async function audit(
  db: Db,
  userId: string | null,
  action: string,
  metadata: { entityType?: string; entityId?: string; [key: string]: unknown } = {},
) {
  const { entityType = 'system', entityId, ...rest } = metadata;
  try {
    await db.run(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, metadata, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
      [crypto.randomUUID(), userId, action, entityType, entityId, json(rest), now()],
    );
  } catch (error) {
    console.error(`Failed to write audit log: ${action} for user ${userId}`, error);
  }
}
