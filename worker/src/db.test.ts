import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Db, isUniqueViolation, now } from './db';
import * as auth from './repo/auth';
import * as exec from './repo/executions';
import * as wf from './repo/workflows';

/**
 * Runs the worker's SQL against a local D1 (the same engine `wrangler dev`
 * uses) built from migrations/ — so a migration and the queries in src/repo/
 * can't drift apart unnoticed. No server or credentials needed; runs in CI.
 */

const MIGRATIONS = join(__dirname, '..', 'migrations');

/** Applies every migration in order, one statement at a time. */
async function migrate(d1: D1Database) {
  for (const file of readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8')
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');
    for (const statement of sql
      .split(/;\s*\n/)
      .map((s) => s.trim())
      .filter(Boolean)) {
      await d1.prepare(statement).run();
    }
  }
}

describe('worker SQL against the D1 schema', () => {
  let mf: Miniflare;
  let db: Db;
  let userId: string;

  beforeAll(async () => {
    mf = new Miniflare({ modules: true, script: 'export default {}', d1Databases: ['DB'] });
    const d1 = (await mf.getD1Database('DB')) as unknown as D1Database;
    await migrate(d1);
    db = new Db(d1);
    userId = crypto.randomUUID();
    await db.batch([auth.insertUserStatement(db, userId, 'sql-test@example.com', 'SQL Test')]);
  });
  afterAll(async () => {
    await mf?.dispose();
  });

  const closeToNow = (iso: string | null) => expect(Math.abs(Date.now() - Date.parse(iso ?? ''))).toBeLessThan(10_000);

  it('workflows: create, list, update, archive; timestamps are ISO UTC', async () => {
    const w = await wf.createWorkflow(db, { userId, name: 'One', status: 'ACTIVE' });
    expect(w.createdAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    closeToNow(w.createdAt);
    expect(w.createdAt).toBe(w.updatedAt);

    expect((await wf.listWorkflows(db, userId, 10, 0)).total).toBe(1);

    const renamed = await wf.updateWorkflow(db, w.id, { name: 'Renamed' });
    expect(renamed).toMatchObject({ name: 'Renamed', status: 'ACTIVE', description: null });

    await wf.updateWorkflow(db, w.id, { status: 'ARCHIVED' });
    expect(await wf.findVisibleWorkflow(db, userId, w.id)).toBeUndefined();
    expect((await wf.workflowOwner(db, w.id))?.userId).toBe(userId);
  });

  it('rejects values the schema forbids', async () => {
    const bad = await db
      .run(
        "INSERT INTO workflows (id, user_id, name, status, created_at, updated_at) VALUES ('x', ?1, 'n', 'BOGUS', 'a', 'a')",
        [userId],
      )
      .catch((e: unknown) => e);
    expect(String(bad)).toMatch(/CHECK constraint failed/);
  });

  it('actions: append position, update, reorder atomically, delete', async () => {
    const w = await wf.createWorkflow(db, { userId, name: 'Steps', status: 'DRAFT' });
    const a = await wf.createAction(db, w.id, { type: 'LOG_MESSAGE', configuration: { message: 'a' } });
    const b = await wf.createAction(db, w.id, { type: 'DELAY', configuration: { seconds: 1 } });
    expect([a.position, b.position]).toEqual([0, 1]);

    const updated = await wf.updateAction(db, a.id, { configuration: { message: 'changed' } });
    expect(updated).toMatchObject({ type: 'LOG_MESSAGE', config: { message: 'changed' }, position: 0 });

    await wf.setActionPositions(db, [b.id, a.id]);
    expect((await wf.listActions(db, w.id)).map((x) => x.id)).toEqual([b.id, a.id]);

    await wf.deleteAction(db, b.id);
    expect(await wf.findAction(db, w.id, b.id)).toBeUndefined();
  });

  it('triggers: upsert keeps id, clone gets a fresh secret, polling events', async () => {
    const w = await wf.createWorkflow(db, { userId, name: 'Hooked', status: 'ACTIVE' });
    const t1 = await wf.upsertTrigger(db, w.id, { type: 'WEBHOOK', config: {}, secret: 'a'.repeat(64) });
    const t2 = await wf.upsertTrigger(db, w.id, { type: 'SCHEDULED', config: { interval: 60 }, secret: null });
    expect(t2.id).toBe(t1.id);
    expect(t2).toMatchObject({ enabled: true, config: { interval: 60 } });
    expect((await wf.findTriggerById(db, t1.id))?.workflowStatus).toBe('ACTIVE');
    expect((await wf.listActivePollingTriggers(db)).map((r) => r.id)).toContain(t1.id);

    await wf.upsertTrigger(db, w.id, { type: 'WEBHOOK', config: {}, secret: 'a'.repeat(64) });
    await wf.createAction(db, w.id, { type: 'LOG_MESSAGE', configuration: { message: 'x' } });
    const copy = await wf.cloneWorkflow(db, userId, w);
    const copyTrigger = await wf.findTrigger(db, copy.id);
    expect(copy).toMatchObject({ status: 'DRAFT', name: 'Copy of Hooked' });
    expect(copyTrigger?.secret).toHaveLength(64);
    expect(copyTrigger?.secret).not.toBe('a'.repeat(64));
    expect(await wf.listActions(db, copy.id)).toHaveLength(1);

    await wf.recordPollingEvent(db, t1.id, true, { snapshot: 1 });
    await wf.recordPollingEvent(db, t1.id, false, undefined, 'HTTP 500');
    const events = await wf.listPollingEvents(db, t1.id);
    expect(events).toHaveLength(2);
    expect(events.find((e) => e.changed)?.responseSnapshot).toEqual({ snapshot: 1 });

    await wf.deleteTrigger(db, w.id);
    expect(await wf.findTrigger(db, w.id)).toBeUndefined();
  });

  it('webhook events: dedup is enforced by the unique constraint', async () => {
    const w = await wf.createWorkflow(db, { userId, name: 'Events', status: 'ACTIVE' });
    const id = await exec.createEvent(db, {
      workflowId: w.id,
      payload: { a: 1 },
      status: 'RECEIVED',
      idempotencyKey: 'k1',
    });
    const dup = await exec
      .createEvent(db, { workflowId: w.id, payload: { a: 1 }, status: 'RECEIVED', idempotencyKey: 'k1' })
      .catch((e: unknown) => e);
    expect(isUniqueViolation(dup)).toBe(true);
    expect((await exec.findEventByKey(db, w.id, 'k1'))?.id).toBe(id);

    await exec.setEventStatus(db, id, 'PROCESSED');
    const listed = await exec.listEvents(db, { workflowId: w.id, status: 'PROCESSED', limit: 10, offset: 0 });
    expect(listed.total).toBe(1);
    expect(listed.rows[0].payload).toEqual({ a: 1 });
    closeToNow(listed.rows[0].receivedAt);
  });

  it('executions and steps: partial patches, atomic checkpoint, stats', async () => {
    const w = await wf.createWorkflow(db, { userId, name: 'Runs', status: 'ACTIVE' });
    const action = await wf.createAction(db, w.id, { type: 'LOG_MESSAGE', configuration: {} });
    const id = await exec.createExecution(db, { workflowId: w.id, triggerId: null, payload: { order: 1 } });
    expect(await exec.countInFlight(db, w.id)).toBe(1);

    await exec.setExecution(db, id, { status: 'RUNNING', startedAt: now() });
    const step = await exec.startStep(db, id, action.id, { order: 1 });
    await db.batch([
      exec.finishStepStatement(db, step, { status: 'SUCCEEDED', output: { logged: true } }),
      exec.setExecutionStatement(db, id, { output: { order: 1, http: { status: 200 } } }),
    ]);
    const mid = await exec.findExecution(db, id);
    // A patch without `status` must not have touched it.
    expect(mid).toMatchObject({ status: 'RUNNING', input: { order: 1 }, output: { order: 1, http: { status: 200 } } });
    closeToNow(mid!.startedAt);

    const failed = await exec.startStep(db, id, action.id, { order: 1 });
    await exec.finishStep(db, failed, { status: 'FAILED', error: 'boom' });
    expect(await exec.succeededActionIds(db, id)).toEqual([action.id]);
    // Both rows can land in the same millisecond here, so created_at may tie.
    expect((await exec.listSteps(db, id)).map((s) => s.status).sort()).toEqual(['FAILED', 'SUCCEEDED']);

    await exec.setExecution(db, id, { status: 'FAILED', error: 'boom', finishedAt: now() });
    expect((await exec.listFailedExecutions(db)).find((e) => e.id === id)?.attemptsMade).toBe(1);

    const page = await exec.listExecutions(db, { userId, status: 'FAILED', workflowId: w.id, limit: 10, offset: 0 });
    expect(page.total).toBe(1);
    const stats = await exec.executionStats(db, userId);
    expect(stats.byStatus.find((s) => s.status === 'FAILED')?.n).toBeGreaterThanOrEqual(1);
    expect(stats.last24h).toBeGreaterThanOrEqual(1);
    expect(stats.avgDurationMs).toBeGreaterThanOrEqual(0);

    await exec.audit(db, userId, 'WORKFLOW_RUN', { entityType: 'workflow_executions', entityId: id, status: 'FAILED' });
  });

  it('auth: a refresh token is spent once, and the chain links old to new', async () => {
    const first = crypto.randomUUID();
    const second = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    await db.batch([auth.insertRefreshTokenStatement(db, { id: first, userId, tokenHash: 'h1', expiresAt })]);

    expect(await auth.revokeRefreshToken(db, first)).toBe(1);
    expect(await auth.revokeRefreshToken(db, first)).toBe(0); // the racing second refresh loses
    await db.batch([
      auth.insertRefreshTokenStatement(db, { id: second, userId, tokenHash: 'h2', expiresAt }),
      auth.linkReplacementStatement(db, first, second),
    ]);
    const stored = await auth.findRefreshToken(db, first);
    expect(stored?.revokedAt).not.toBeNull();
    expect(stored?.expiresAt).toBe(expiresAt);
    const chain = await db.one<{ next: string }>(
      'SELECT replaced_by_token_id AS next FROM refresh_tokens WHERE id = ?1',
      [first],
    );
    expect(chain?.next).toBe(second);
  });

  it('auth: a Google connection keeps its refresh token when Google sends none', async () => {
    const sub = `google-${crypto.randomUUID()}`;
    const creds = {
      email: 'x@example.com',
      scopes: ['openid', 'email'],
      accessTokenEnc: 'v1:a',
      accessTokenExpiresAt: now(),
    };
    await db.batch([
      auth.insertGoogleConnectionStatement(db, userId, sub, { ...creds, refreshTokenEnc: 'v1:refresh' }),
    ]);
    const conn = await auth.findGoogleConnection(db, sub);
    expect(conn?.userId).toBe(userId);

    await auth.updateGoogleConnection(db, conn!.id, { ...creds, accessTokenEnc: 'v1:b' });
    const row = await db.one<{ refresh: string; scopes: string }>(
      'SELECT refresh_token_enc AS refresh, scopes FROM connections WHERE id = ?1',
      [conn!.id],
    );
    expect(row?.refresh).toBe('v1:refresh');
    expect(JSON.parse(row!.scopes)).toEqual(['openid', 'email']);

    expect((await auth.findUserByEmailWithGoogle(db, 'sql-test@example.com'))?.hasGoogle).toBe(true);
    const second = await db
      .batch([auth.insertGoogleConnectionStatement(db, userId, `google-${crypto.randomUUID()}`, creds)])
      .catch((e: unknown) => e);
    expect(isUniqueViolation(second)).toBe(true); // one Google account per user
  });

  it('telegram: upsert creates, then re-activates', async () => {
    const telegramId = 900_000_000_000 + Math.floor(Math.random() * 1e6); // beyond 32-bit, like real ids
    await auth.upsertTelegramUser(db, { telegramId, chatId: telegramId, username: 'a' });
    await db.run('UPDATE telegram_users SET is_active = 0 WHERE telegram_id = ?1', [telegramId]);
    await auth.upsertTelegramUser(db, { telegramId, chatId: telegramId, username: 'b' });
    const row = await db.one<{ username: string; active: number; tid: number }>(
      'SELECT username, is_active AS active, telegram_id AS tid FROM telegram_users WHERE telegram_id = ?1',
      [telegramId],
    );
    expect(row).toEqual({ username: 'b', active: 1, tid: telegramId });
  });

  it('deleting a workflow cascades to its steps and runs (foreign keys are enforced)', async () => {
    const w = await wf.createWorkflow(db, { userId, name: 'Cascade', status: 'ACTIVE' });
    await wf.createAction(db, w.id, { type: 'LOG_MESSAGE', configuration: {} });
    await exec.createExecution(db, { workflowId: w.id, triggerId: null, payload: {} });
    await db.run('DELETE FROM workflows WHERE id = ?1', [w.id]);
    const left = await db.one<{ n: number }>(
      'SELECT (SELECT count(*) FROM actions WHERE workflow_id = ?1) + (SELECT count(*) FROM workflow_executions WHERE workflow_id = ?1) AS n',
      [w.id],
    );
    expect(left?.n).toBe(0);
  });
});
