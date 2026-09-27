import { timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import {
  SIGNATURE_HEADER,
  isValidWebhookSignature,
  webhookFingerprint,
} from '../../../backend/src/webhooks/webhook-signature';
import {
  TELEGRAM_SECRET_HEADER,
  handleTelegramUpdate,
  isValidTelegramSecret,
} from '../../../backend/src/telegram/telegram-bot';
import type { AppEnv } from '../app-env';
import { isUniqueViolation, withDb } from '../db';
import { admitInBackground } from '../engine/admission';
import type { Env } from '../env';
import { HttpError, badRequest, isUuid, notFound, unauthorized } from '../http';
import { upsertTelegramUser } from '../repo/auth';
import { createEvent, findEventByKey, findExecution, listFailedExecutions, setExecution } from '../repo/executions';
import { findTrigger, findWorkflow } from '../repo/workflows';

/**
 * Routes that aren't called by a signed-in user: webhook ingress (HMAC),
 * the Telegram bot (secret header), health (open), admin (shared secret).
 */

// --- webhook ingress: validate → persist → hand off → return ------------

export const webhookRoutes = new Hono<AppEnv>().post('/:workflowId', async (c) => {
  const workflowId = c.req.param('workflowId');
  // The exact bytes the sender signed. Hono doesn't pre-parse bodies, so
  // there is no raw-body middleware to break here (unlike main.ts).
  const rawBody = new Uint8Array(await c.req.arrayBuffer());

  let payload: unknown = {};
  if (rawBody.length > 0) {
    try {
      payload = JSON.parse(new TextDecoder().decode(rawBody));
    } catch {
      throw badRequest('Invalid JSON payload');
    }
  }

  const db = c.get('db');
  const workflow = isUuid(workflowId) ? await findWorkflow(db, workflowId) : undefined;
  if (!workflow || workflow.status !== 'ACTIVE') throw notFound('Workflow not found or not active');

  const trigger = await findTrigger(db, workflowId);
  if (!trigger || trigger.type !== 'WEBHOOK') throw badRequest('Workflow does not have a webhook trigger');

  if (trigger.secret) {
    const signature = c.req.header(SIGNATURE_HEADER);
    // Same bodies the backend sent, so senders see identical errors.
    if (!signature) throw new HttpError(401, 'Missing signature', { error: 'Missing signature' });
    if (!isValidWebhookSignature(rawBody, trigger.secret, signature)) {
      throw new HttpError(401, 'Invalid signature', { error: 'Invalid signature' });
    }
  }

  const idempotencyKey = c.req.header('x-idempotency-key')?.trim() || webhookFingerprint(workflowId, payload);
  const duplicate = await findEventByKey(db, workflowId, idempotencyKey);
  if (duplicate) return c.json({ received: true, duplicate: true, eventId: duplicate.id });

  let eventId: string;
  try {
    eventId = await createEvent(db, { workflowId, payload, status: 'RECEIVED', idempotencyKey });
  } catch (error) {
    // Two identical deliveries raced past the check above — the unique
    // constraint decides, and the loser reports the winner's event.
    if (!isUniqueViolation(error)) throw error;
    const winner = await findEventByKey(db, workflowId, idempotencyKey);
    return c.json({ received: true, duplicate: true, eventId: winner?.id ?? '' });
  }

  admitInBackground(c.env, c.executionCtx, { workflowId, payload, source: 'webhook', webhookEventId: eventId });
  return c.json({ received: true, eventId });
});

// --- Telegram bot (webhook mode) ----------------------------------------

export const telegramRoutes = new Hono<AppEnv>().post('/webhook', async (c) => {
  const botToken = c.env.TELEGRAM_BOT_TOKEN;
  if (!botToken || !isValidTelegramSecret(c.req.header(TELEGRAM_SECRET_HEADER), c.env.TELEGRAM_WEBHOOK_SECRET)) {
    throw unauthorized('Invalid Telegram webhook secret');
  }
  try {
    await handleTelegramUpdate(await c.req.json(), {
      botToken,
      saveUser: (user) => upsertTelegramUser(c.get('db'), user).then(() => undefined),
    });
  } catch (error) {
    // Still 200 — Telegram would otherwise redeliver the same update forever.
    console.error('Telegram update failed', error);
  }
  return c.json({ ok: true });
});

// --- health ----------------------------------------------------------------

export const healthRoutes = new Hono<AppEnv>().get('/', async (c) => {
  // Caught, so an unreachable database reports "down" instead of a 500.
  const db = await withDb(c.env, (conn) => conn.one('SELECT 1')).then(
    () => true,
    () => false,
  );
  return c.json({
    status: db ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    db: db ? 'up' : 'down',
    // Kept for response-shape compatibility: the Worker has no Redis or BullMQ
    // (the database is D1).
    redis: 'not used',
    queueDepth: 0,
    workers: 'cloudflare-workflows',
  });
});

// --- admin (failed runs) ------------------------------------------------

function assertAdmin(env: Env, provided: string | undefined) {
  const expected = env.ADMIN_SECRET;
  // Never fail open: no secret configured means the routes are disabled.
  if (!expected) throw unauthorized('Admin endpoints are disabled: ADMIN_SECRET is not configured');
  const a = Buffer.from(provided ?? '');
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw unauthorized('Invalid admin secret');
}

export const adminRoutes = new Hono<AppEnv>()
  .use(async (c, next) => {
    assertAdmin(c.env, c.req.header('x-admin-secret'));
    await next();
  })
  .get('/failed-jobs', async (c) => {
    const failed = await listFailedExecutions(c.get('db'));
    return c.json(
      failed.map((e) => ({
        jobId: e.id,
        executionId: e.id,
        error: e.error,
        failedAt: e.finishedAt,
        attemptsMade: e.attemptsMade,
        data: { executionId: e.id },
      })),
    );
  })
  .post('/failed-jobs/:jobId/retry', async (c) => {
    const id = c.req.param('jobId');
    const db = c.get('db');
    const execution = isUuid(id) ? await findExecution(db, id) : undefined;
    if (!execution) throw notFound('Job not found');

    await setExecution(db, id, { status: 'PENDING', error: null, finishedAt: null });
    // A fresh instance for the same execution. Its first step skips the
    // steps that already succeeded and resumes from the saved payload.
    await c.env.RUN_WORKFLOW.create({ id: `${id}-retry-${Date.now()}`, params: { executionId: id } });
    return c.json({ requeued: true });
  });
