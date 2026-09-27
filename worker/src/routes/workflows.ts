import { randomBytes } from 'node:crypto';
import { Hono } from 'hono';
import { normalizePollingConfig } from '../../../backend/src/scheduler/polling-config';
import { pageMeta, pagination, requireUser, requireWorkflowOwner, type AppEnv } from '../app-env';
import type { Db } from '../db';
import { admitInBackground } from '../engine/admission';
import { syncTriggerPoller, syncWorkflowPoller } from '../engine/polling';
import { badRequest, intQuery, notFound, parseBody, schemas } from '../http';
import { audit, createEvent, listEvents } from '../repo/executions';
import {
  cloneWorkflow,
  createAction,
  createWorkflow,
  deleteAction,
  deleteTrigger,
  findAction,
  findTrigger,
  findVisibleWorkflow,
  findWorkflow,
  listActions,
  listPollingEvents,
  listWorkflows,
  serializeAction,
  serializeTrigger,
  serializeWorkflow,
  setActionPositions,
  updateAction,
  updateWorkflow,
  upsertTrigger,
  type WorkflowStatus,
} from '../repo/workflows';

// Ports of the backend's workflows, actions, triggers and (authenticated)
// webhooks controllers. Status codes match Nest's defaults: POST → 201
// unless the backend set @HttpCode(200).

async function visibleOrThrow(db: Db, userId: string, id: string) {
  const workflow = await findVisibleWorkflow(db, userId, id);
  if (!workflow) throw notFound('Workflow not found');
  return workflow;
}

export const workflowRoutes = new Hono<AppEnv>()
  .use(requireUser)
  // Hono's `/:id/*` also matches bare `/:id`, so this one line guards every route below.
  .use('/:id/*', requireWorkflowOwner)

  // --- workflows -----------------------------------------------------------

  .post('/', async (c) => {
    const body = await parseBody(c, schemas.createWorkflow);
    const userId = c.get('user').sub;
    const workflow = await createWorkflow(c.get('db'), {
      userId,
      name: body.name,
      description: body.description,
      // Same default as the backend: a new workflow starts on.
      status: (body.enabled ?? true) ? 'ACTIVE' : 'PAUSED',
    });
    await audit(c.get('db'), userId, 'CREATE', {
      entityType: 'workflows',
      entityId: workflow.id,
      event: 'workflow.created',
      workflowId: workflow.id,
    });
    return c.json(serializeWorkflow(workflow), 201);
  })
  .get('/', async (c) => {
    const p = pagination(intQuery(c.req.query('page'), 1), intQuery(c.req.query('limit'), 20));
    const { rows, total } = await listWorkflows(c.get('db'), c.get('user').sub, p.limit, p.offset);
    return c.json({ data: rows.map(serializeWorkflow), meta: pageMeta(p, total) });
  })
  .get('/:id', async (c) =>
    c.json(serializeWorkflow(await visibleOrThrow(c.get('db'), c.get('user').sub, c.req.param('id')))),
  )
  .patch('/:id', async (c) => {
    const body = await parseBody(c, schemas.updateWorkflow);
    const { db, userId, id } = { db: c.get('db'), userId: c.get('user').sub, id: c.req.param('id') };
    await visibleOrThrow(db, userId, id);
    const workflow = await updateWorkflow(db, id, {
      name: body.name,
      description: body.description,
      status: body.enabled === undefined ? undefined : body.enabled ? 'ACTIVE' : 'PAUSED',
    });
    await audit(db, userId, 'UPDATE', {
      entityType: 'workflows',
      entityId: id,
      event: 'workflow.updated',
      workflowId: id,
    });
    if (body.enabled !== undefined) await syncWorkflowPoller(c.env, db, id);
    return c.json(serializeWorkflow(workflow));
  })
  .delete('/:id', (c) =>
    setStatus(c.env, c.get('db'), c.get('user').sub, c.req.param('id'), 'ARCHIVED', 'DELETE', 'workflow.deleted').then(
      (w) => c.json(w),
    ),
  )
  .post('/:id/pause', (c) =>
    setStatus(c.env, c.get('db'), c.get('user').sub, c.req.param('id'), 'PAUSED', 'UPDATE', 'workflow.paused').then(
      (w) => c.json(w),
    ),
  )
  .post('/:id/resume', (c) =>
    setStatus(c.env, c.get('db'), c.get('user').sub, c.req.param('id'), 'ACTIVE', 'UPDATE', 'workflow.resumed').then(
      (w) => c.json(w),
    ),
  )
  .post('/:id/clone', async (c) => {
    const { db, userId, id } = { db: c.get('db'), userId: c.get('user').sub, id: c.req.param('id') };
    const source = await visibleOrThrow(db, userId, id);
    const copy = await cloneWorkflow(db, userId, source);
    await audit(db, userId, 'CREATE', {
      entityType: 'workflows',
      entityId: copy.id,
      event: 'workflow.cloned',
      workflowId: copy.id,
      sourceWorkflowId: source.id,
    });
    return c.json(serializeWorkflow(copy), 201);
  })
  .get('/:id/poll-history', async (c) => {
    const { db, id } = { db: c.get('db'), id: c.req.param('id') };
    await visibleOrThrow(db, c.get('user').sub, id);
    const trigger = await findTrigger(db, id);
    return c.json({ data: trigger ? await listPollingEvents(db, trigger.id) : [] });
  })

  // --- actions (steps) ----------------------------------------------------

  .post('/:id/actions', async (c) => {
    const body = await parseBody(c, schemas.createAction);
    return c.json(serializeAction(await createAction(c.get('db'), c.req.param('id'), body)), 201);
  })
  .get('/:id/actions', async (c) => c.json((await listActions(c.get('db'), c.req.param('id'))).map(serializeAction)))
  .post('/:id/actions/reorder', async (c) => {
    const { orderedIds } = await parseBody(c, schemas.reorderActions);
    const db = c.get('db');
    const workflowId = c.req.param('id');
    const existing = new Set((await listActions(db, workflowId)).map((a) => a.id));
    for (const id of orderedIds) {
      if (!existing.has(id)) throw badRequest(`Action ${id} does not belong to this workflow`);
    }
    const provided = new Set(orderedIds);
    if (provided.size !== existing.size) {
      throw badRequest(
        `Expected ${existing.size} action IDs, received ${provided.size}. All actions must be included in the reorder.`,
      );
    }
    await setActionPositions(db, orderedIds);
    return c.json((await listActions(db, workflowId)).map(serializeAction));
  })
  .patch('/:id/actions/:aid', async (c) => {
    const body = await parseBody(c, schemas.updateAction);
    const db = c.get('db');
    const action = await findAction(db, c.req.param('id'), c.req.param('aid'));
    if (!action) throw notFound('Action not found in this workflow');
    return c.json(serializeAction(await updateAction(db, action.id, body)));
  })
  .delete('/:id/actions/:aid', async (c) => {
    const db = c.get('db');
    const action = await findAction(db, c.req.param('id'), c.req.param('aid'));
    if (!action) throw notFound('Action not found in this workflow');
    await deleteAction(db, action.id);
    return c.json({ deleted: true });
  })

  // --- trigger -------------------------------------------------------------

  .post('/:id/trigger', async (c) => {
    const body = await parseBody(c, schemas.upsertTrigger);
    const db = c.get('db');
    const workflowId = c.req.param('id');
    if (body.type === 'SCHEDULED') {
      try {
        normalizePollingConfig(body.configuration ?? {});
      } catch (error) {
        throw badRequest(error instanceof Error ? error.message : 'Invalid polling trigger configuration');
      }
    }

    const existing = await findTrigger(db, workflowId);
    // Keep an existing WEBHOOK's secret so live senders keep working; only a
    // trigger becoming WEBHOOK gets a fresh one.
    const secret =
      body.type === 'WEBHOOK'
        ? existing?.type === 'WEBHOOK'
          ? existing.secret
          : randomBytes(32).toString('hex')
        : null;

    const trigger = await upsertTrigger(db, workflowId, { type: body.type, config: body.configuration ?? {}, secret });
    // Starts the poller for SCHEDULED, stops it for anything else — the
    // upsert keeps the same trigger id either way.
    await syncTriggerPoller(c.env, db, trigger.id);
    return c.json(serializeTrigger(trigger), 201);
  })
  .get('/:id/trigger', async (c) => {
    const trigger = await findTrigger(c.get('db'), c.req.param('id'));
    if (!trigger) throw notFound('Trigger not found for this workflow');
    return c.json(serializeTrigger(trigger));
  })
  .delete('/:id/trigger', async (c) => {
    const db = c.get('db');
    const workflowId = c.req.param('id');
    const trigger = await findTrigger(db, workflowId);
    if (!trigger) throw notFound('Trigger not found for this workflow');
    await deleteTrigger(db, workflowId);
    await syncTriggerPoller(c.env, db, trigger.id);
    await audit(db, c.get('user').sub, 'trigger.deleted', { entityType: 'triggers', entityId: trigger.id, workflowId });
    return c.json({ deleted: true });
  })

  // --- manual fire + delivery log ----------------------------------------

  .post('/:id/trigger/fire', async (c) => {
    const body = await parseBody(c, schemas.manualFire);
    const db = c.get('db');
    const workflowId = c.req.param('id');
    const workflow = await findWorkflow(db, workflowId);
    if (!workflow || workflow.status !== 'ACTIVE') throw notFound('Workflow not found or not active');

    const payload = body.payload ?? {};
    const eventId = await createEvent(db, { workflowId, payload, status: 'MANUAL', idempotencyKey: null });
    admitInBackground(c.env, c.executionCtx, { workflowId, payload, source: 'manual', webhookEventId: eventId });
    return c.json({ fired: true, eventId });
  })
  .get('/:id/webhook-events', async (c) => {
    const p = pagination(intQuery(c.req.query('page'), 1), intQuery(c.req.query('limit'), 20));
    const { rows, total } = await listEvents(c.get('db'), {
      workflowId: c.req.param('id'),
      status: c.req.query('status') || undefined,
      limit: p.limit,
      offset: p.offset,
    });
    return c.json({ data: rows, meta: pageMeta(p, total) });
  });

async function setStatus(
  env: AppEnv['Bindings'],
  db: Db,
  userId: string,
  id: string,
  status: WorkflowStatus,
  action: string,
  event: string,
) {
  await visibleOrThrow(db, userId, id);
  const workflow = await updateWorkflow(db, id, { status });
  await audit(db, userId, action, {
    entityType: 'workflows',
    entityId: id,
    event,
    workflowId: id,
    ...(status === 'ARCHIVED' ? { deleteType: 'soft' } : {}),
  });
  await syncWorkflowPoller(env, db, id);
  return serializeWorkflow(workflow);
}
