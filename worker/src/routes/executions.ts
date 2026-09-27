import { Hono } from 'hono';
import { MAX_EXECUTIONS_PER_USER_PER_HOUR } from '../../../backend/src/common/limits';
import { pageMeta, pagination, requireUser, type AppEnv } from '../app-env';
import { now } from '../db';
import { rateLimiterFor } from '../durable/rate-limiter';
import { badRequest, intQuery, isUuid, notFound } from '../http';
import {
  EXECUTION_STATUSES,
  executionStats,
  findExecution,
  listExecutions,
  listSteps,
  setExecution,
  type ExecutionStatus,
} from '../repo/executions';

// Port of the backend ExecutionsController / ExecutionsService.

function parseStatus(value: string | undefined): ExecutionStatus | undefined {
  if (!value) return undefined;
  if (!EXECUTION_STATUSES.includes(value as ExecutionStatus)) {
    throw badRequest(`status must be one of: ${EXECUTION_STATUSES.join(', ')}`);
  }
  return value as ExecutionStatus;
}

export const executionRoutes = new Hono<AppEnv>()
  .use(requireUser)
  .get('/', async (c) => {
    const p = pagination(intQuery(c.req.query('page'), 1), intQuery(c.req.query('limit'), 20));
    const workflowId = c.req.query('workflowId') || undefined;
    if (workflowId && !isUuid(workflowId)) throw badRequest('workflowId must be a UUID');
    const { rows, total } = await listExecutions(c.get('db'), {
      userId: c.get('user').sub,
      status: parseStatus(c.req.query('status')),
      workflowId,
      limit: p.limit,
      offset: p.offset,
    });
    return c.json({
      data: rows.map((e) => ({
        id: e.id,
        workflowId: e.workflowId,
        workflowName: e.workflowName,
        status: e.status,
        startedAt: e.startedAt,
        finishedAt: e.finishedAt,
      })),
      meta: pageMeta(p, total),
    });
  })
  .get('/stats', async (c) => {
    const userId = c.get('user').sub;
    const [stats, used] = await Promise.all([
      executionStats(c.get('db'), userId),
      rateLimiterFor(c.env, userId).used(),
    ]);
    const byStatus = Object.fromEntries(EXECUTION_STATUSES.map((s) => [s, 0])) as Record<ExecutionStatus, number>;
    for (const row of stats.byStatus) byStatus[row.status] = row.n;
    return c.json({
      total: stats.total,
      byStatus,
      last24hTotal: stats.last24h,
      avgDurationMs: stats.avgDurationMs,
      // No separate dead-letter queue on Workflows: a run that exhausted its
      // retries simply ends FAILED.
      failedJobsInDLQ: byStatus.FAILED,
      rateLimitRemaining: Math.max(0, MAX_EXECUTIONS_PER_USER_PER_HOUR - used),
    });
  })
  .get('/:id', async (c) => {
    const id = c.req.param('id');
    const execution = isUuid(id) ? await findExecution(c.get('db'), id) : undefined;
    if (!execution || execution.userId !== c.get('user').sub) throw notFound('Execution not found');
    const steps = await listSteps(c.get('db'), id);
    return c.json({
      id: execution.id,
      workflowId: execution.workflowId,
      workflowName: execution.workflowName,
      triggerId: execution.triggerId,
      status: execution.status,
      input: execution.input,
      output: execution.output,
      error: execution.error,
      startedAt: execution.startedAt,
      finishedAt: execution.finishedAt,
      createdAt: execution.createdAt,
      actionExecutions: steps,
    });
  })
  .post('/:id/cancel', async (c) => {
    const id = c.req.param('id');
    const execution = isUuid(id) ? await findExecution(c.get('db'), id) : undefined;
    if (!execution || execution.userId !== c.get('user').sub) throw notFound('Execution not found');
    if (execution.status !== 'PENDING') throw badRequest('Only PENDING executions can be cancelled');

    await setExecution(c.get('db'), id, { status: 'CANCELLED', finishedAt: now() });
    // Best effort: if the instance already started, its first step sees
    // CANCELLED and stops (see RunWorkflow.load).
    try {
      await (await c.env.RUN_WORKFLOW.get(id)).terminate();
    } catch {
      // Not found or already finished — expected races, not errors.
    }
    return c.json({ cancelled: true });
  });
