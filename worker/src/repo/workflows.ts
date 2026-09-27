import { randomBytes } from 'node:crypto';
import type { Db } from '../db';
import { bool, json, now, parseJson } from '../db';

// Each query mirrors the NestJS backend's (backend/src/workflows|triggers)
// and returns the field names its serialize() produced.

export type WorkflowStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
export type TriggerType = 'WEBHOOK' | 'MANUAL' | 'SCHEDULED';

export interface WorkflowRow {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  status: WorkflowStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ActionRow {
  id: string;
  workflowId: string;
  type: string;
  config: Record<string, unknown>;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface TriggerRow {
  id: string;
  workflowId: string;
  type: TriggerType;
  config: Record<string, unknown>;
  secret: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

const WORKFLOW_COLS = `id, user_id AS userId, name, description, status, version,
  created_at AS createdAt, updated_at AS updatedAt`;
const ACTION_COLS = `id, workflow_id AS workflowId, type, config, position,
  created_at AS createdAt, updated_at AS updatedAt`;
const TRIGGER_COLS = `t.id, t.workflow_id AS workflowId, t.type, t.config, t.secret, t.enabled,
  t.created_at AS createdAt, t.updated_at AS updatedAt`;

// D1 hands back JSON as text and booleans as 0/1.
type RawAction = Omit<ActionRow, 'config'> & { config: string };
type RawTrigger = Omit<TriggerRow, 'config' | 'enabled'> & { config: string; enabled: number };

const toAction = (r: RawAction): ActionRow => ({
  ...r,
  config: parseJson<Record<string, unknown>>(r.config) ?? {},
});
const toTrigger = (r: RawTrigger): TriggerRow => ({
  ...r,
  config: parseJson<Record<string, unknown>>(r.config) ?? {},
  enabled: bool(r.enabled),
});

export function serializeWorkflow(w: WorkflowRow) {
  return {
    id: w.id,
    userId: w.userId,
    name: w.name,
    description: w.description,
    enabled: w.status === 'ACTIVE',
    status: w.status,
    version: w.version,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  };
}

export function serializeAction(a: ActionRow) {
  return {
    id: a.id,
    workflowId: a.workflowId,
    type: a.type,
    configuration: a.config,
    order: a.position,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

/** The full HMAC secret never leaves the API — only its first 8 characters. */
export function serializeTrigger(t: TriggerRow) {
  return {
    id: t.id,
    workflowId: t.workflowId,
    type: t.type,
    configuration: t.config,
    secret: t.secret ? `${t.secret.slice(0, 8)}...` : null,
    enabled: t.enabled,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

// --- workflows ---------------------------------------------------------

export function workflowOwner(db: Db, id: string) {
  return db.one<{ userId: string; status: WorkflowStatus }>(
    'SELECT user_id AS userId, status FROM workflows WHERE id = ?1',
    [id],
  );
}

export function findVisibleWorkflow(db: Db, userId: string, id: string) {
  return db.one<WorkflowRow>(
    `SELECT ${WORKFLOW_COLS} FROM workflows WHERE id = ?1 AND user_id = ?2 AND status <> 'ARCHIVED'`,
    [id, userId],
  );
}

export function findWorkflow(db: Db, id: string) {
  return db.one<WorkflowRow>(`SELECT ${WORKFLOW_COLS} FROM workflows WHERE id = ?1`, [id]);
}

function insertWorkflow(
  db: Db,
  id: string,
  input: { userId: string; name: string; description?: string | null; status: WorkflowStatus },
  at: string,
) {
  return db.statement(
    `INSERT INTO workflows (id, user_id, name, description, status, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)`,
    [id, input.userId, input.name, input.description ?? null, input.status, at],
  );
}

export async function createWorkflow(
  db: Db,
  input: { userId: string; name: string; description?: string; status: WorkflowStatus },
) {
  const id = crypto.randomUUID();
  await db.batch([insertWorkflow(db, id, input, now())]);
  return (await findWorkflow(db, id))!;
}

export async function listWorkflows(db: Db, userId: string, limit: number, offset: number) {
  const rows = await db.many<WorkflowRow>(
    `SELECT ${WORKFLOW_COLS} FROM workflows WHERE user_id = ?1 AND status <> 'ARCHIVED'
     ORDER BY created_at DESC LIMIT ?2 OFFSET ?3`,
    [userId, limit, offset],
  );
  const count = await db.one<{ n: number }>(
    `SELECT count(*) AS n FROM workflows WHERE user_id = ?1 AND status <> 'ARCHIVED'`,
    [userId],
  );
  return { rows, total: count?.n ?? 0 };
}

/** Undefined fields are left as they are (Prisma's update semantics). */
export async function updateWorkflow(
  db: Db,
  id: string,
  patch: { name?: string; description?: string; status?: WorkflowStatus },
) {
  return (await db.one<WorkflowRow>(
    `UPDATE workflows SET
       name = COALESCE(?2, name),
       description = COALESCE(?3, description),
       status = COALESCE(?4, status),
       updated_at = ?5
     WHERE id = ?1 RETURNING ${WORKFLOW_COLS}`,
    [id, patch.name, patch.description, patch.status, now()],
  ))!;
}

/**
 * Clone as a DRAFT with a fresh WEBHOOK secret — the source and the copy must
 * never share an HMAC key. One atomic batch: a copy never exists half-made,
 * and it costs one D1 call however many steps the workflow has (the Free
 * plan allows 50 D1 calls per request).
 */
export async function cloneWorkflow(db: Db, userId: string, source: WorkflowRow) {
  const copyId = crypto.randomUUID();
  const at = now();
  const trigger = await findTrigger(db, source.id);
  const conditions = await db.many<{ type: string; expression: string; position: number }>(
    'SELECT type, expression, position FROM conditions WHERE workflow_id = ?1',
    [source.id],
  );
  const actions = await listActions(db, source.id);

  await db.batch([
    insertWorkflow(
      db,
      copyId,
      { userId, name: `Copy of ${source.name}`, description: source.description, status: 'DRAFT' },
      at,
    ),
    ...(trigger
      ? [
          db.statement(
            `INSERT INTO triggers (id, workflow_id, type, config, secret, enabled, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)`,
            [
              crypto.randomUUID(),
              copyId,
              trigger.type,
              json(trigger.config),
              trigger.type === 'WEBHOOK' ? randomBytes(32).toString('hex') : null,
              trigger.enabled ? 1 : 0,
              at,
            ],
          ),
        ]
      : []),
    ...conditions.map((c) =>
      db.statement(
        `INSERT INTO conditions (id, workflow_id, type, expression, position, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)`,
        [crypto.randomUUID(), copyId, c.type, c.expression, c.position, at],
      ),
    ),
    ...actions.map((a) =>
      db.statement(
        `INSERT INTO actions (id, workflow_id, type, config, position, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)`,
        [crypto.randomUUID(), copyId, a.type, json(a.config), a.position, at],
      ),
    ),
  ]);
  return (await findWorkflow(db, copyId))!;
}

// --- actions -----------------------------------------------------------

export async function listActions(db: Db, workflowId: string) {
  const rows = await db.many<RawAction>(
    `SELECT ${ACTION_COLS} FROM actions WHERE workflow_id = ?1 ORDER BY position ASC`,
    [workflowId],
  );
  return rows.map(toAction);
}

export async function findAction(db: Db, workflowId: string, actionId: string) {
  const row = await db.one<RawAction>(`SELECT ${ACTION_COLS} FROM actions WHERE id = ?1 AND workflow_id = ?2`, [
    actionId,
    workflowId,
  ]);
  return row && toAction(row);
}

/** Position defaults to one past the current last step. */
export async function createAction(
  db: Db,
  workflowId: string,
  input: { type: string; configuration?: Record<string, unknown>; order?: number },
) {
  let position = input.order;
  if (position === undefined) {
    const last = await db.one<{ position: number }>(
      'SELECT position FROM actions WHERE workflow_id = ?1 ORDER BY position DESC LIMIT 1',
      [workflowId],
    );
    position = last ? last.position + 1 : 0;
  }
  const row = await db.one<RawAction>(
    `INSERT INTO actions (id, workflow_id, type, config, position, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6) RETURNING ${ACTION_COLS}`,
    [crypto.randomUUID(), workflowId, input.type, json(input.configuration ?? {}), position, now()],
  );
  return toAction(row!);
}

export async function updateAction(
  db: Db,
  actionId: string,
  patch: { type?: string; configuration?: Record<string, unknown>; order?: number },
) {
  const row = await db.one<RawAction>(
    `UPDATE actions SET
       type = COALESCE(?2, type),
       config = COALESCE(?3, config),
       position = COALESCE(?4, position),
       updated_at = ?5
     WHERE id = ?1 RETURNING ${ACTION_COLS}`,
    [actionId, patch.type, json(patch.configuration), patch.order, now()],
  );
  return toAction(row!);
}

export function deleteAction(db: Db, actionId: string) {
  return db.run('DELETE FROM actions WHERE id = ?1', [actionId]);
}

/** One atomic batch — a reorder never lands half-applied. */
export async function setActionPositions(db: Db, orderedIds: string[]) {
  const at = now();
  await db.batch(
    orderedIds.map((id, index) =>
      db.statement('UPDATE actions SET position = ?2, updated_at = ?3 WHERE id = ?1', [id, index, at]),
    ),
  );
}

// --- triggers ----------------------------------------------------------

export async function findTrigger(db: Db, workflowId: string) {
  const row = await db.one<RawTrigger>(`SELECT ${TRIGGER_COLS} FROM triggers t WHERE t.workflow_id = ?1`, [workflowId]);
  return row && toTrigger(row);
}

export async function findTriggerById(db: Db, id: string) {
  const row = await db.one<RawTrigger & { workflowStatus: WorkflowStatus }>(
    `SELECT ${TRIGGER_COLS}, w.status AS workflowStatus
     FROM triggers t JOIN workflows w ON w.id = t.workflow_id WHERE t.id = ?1`,
    [id],
  );
  return row && { ...toTrigger(row), workflowStatus: row.workflowStatus };
}

export async function upsertTrigger(
  db: Db,
  workflowId: string,
  input: { type: TriggerType; config: Record<string, unknown>; secret: string | null },
) {
  const row = await db.one<RawTrigger>(
    `INSERT INTO triggers (id, workflow_id, type, config, secret, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
     ON CONFLICT (workflow_id) DO UPDATE SET
       type = excluded.type, config = excluded.config, secret = excluded.secret, updated_at = excluded.updated_at
     RETURNING id, workflow_id AS workflowId, type, config, secret, enabled,
       created_at AS createdAt, updated_at AS updatedAt`,
    [crypto.randomUUID(), workflowId, input.type, json(input.config), input.secret, now()],
  );
  return toTrigger(row!);
}

export function deleteTrigger(db: Db, workflowId: string) {
  return db.run('DELETE FROM triggers WHERE workflow_id = ?1', [workflowId]);
}

/** Every trigger that should currently be polling, with its config. */
export async function listActivePollingTriggers(db: Db) {
  const rows = await db.many<{ id: string; config: string }>(
    `SELECT t.id, t.config FROM triggers t JOIN workflows w ON w.id = t.workflow_id
     WHERE t.type = 'SCHEDULED' AND t.enabled = 1 AND w.status = 'ACTIVE'`,
  );
  return rows.map((r) => ({ id: r.id, config: parseJson<Record<string, unknown>>(r.config) ?? {} }));
}

// --- polling events ----------------------------------------------------

export function recordPollingEvent(db: Db, triggerId: string, changed: boolean, snapshot?: unknown, error?: string) {
  return db.run(
    `INSERT INTO polling_events (id, trigger_id, polled_at, changed, response_snapshot, error)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    [crypto.randomUUID(), triggerId, now(), changed ? 1 : 0, json(snapshot), error],
  );
}

export async function listPollingEvents(db: Db, triggerId: string) {
  const rows = await db.many<{
    id: string;
    polledAt: string;
    changed: number;
    error: string | null;
    responseSnapshot: string | null;
  }>(
    `SELECT id, polled_at AS polledAt, changed, error, response_snapshot AS responseSnapshot
     FROM polling_events WHERE trigger_id = ?1 ORDER BY polled_at DESC LIMIT 50`,
    [triggerId],
  );
  return rows.map((r) => ({ ...r, changed: bool(r.changed), responseSnapshot: parseJson(r.responseSnapshot) }));
}
