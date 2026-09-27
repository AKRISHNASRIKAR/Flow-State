import { createMiddleware } from 'hono/factory';
import type { AccessTokenPayload } from './auth/session';
import { verifyAccessToken } from './auth/session';
import type { Db } from './db';
import type { Env } from './env';
import { badRequest, forbidden, isUuid, notFound, unauthorized } from './http';
import { workflowOwner } from './repo/workflows';

export type AppEnv = {
  Bindings: Env;
  Variables: { db: Db; user: AccessTokenPayload };
};

/** Port of JwtAuthGuard: `Authorization: Bearer <access token>`. */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const [type, token] = c.req.header('authorization')?.split(' ') ?? [];
  if (type !== 'Bearer' || !token) throw unauthorized('Missing access token');
  try {
    c.set('user', await verifyAccessToken(c.env, token));
  } catch {
    throw unauthorized('Invalid access token');
  }
  await next();
});

/**
 * Port of WorkflowOwnerGuard for /workflows/:id/*. Like the guard it doesn't
 * filter archived workflows — the handlers that must, do.
 */
export const requireWorkflowOwner = createMiddleware<AppEnv>(async (c, next) => {
  const id = c.req.param('id');
  if (!isUuid(id)) throw badRequest('Invalid workflow ID format');
  const owner = await workflowOwner(c.get('db'), id);
  if (!owner) throw notFound('Workflow not found');
  if (owner.userId !== c.get('user').sub) throw forbidden('You do not own this workflow');
  await next();
});

export function pagination(page: number, limit: number, maxLimit = 100) {
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(Math.max(1, limit), maxLimit);
  return { page: safePage, limit: safeLimit, offset: (safePage - 1) * safeLimit };
}

export function pageMeta(p: { page: number; limit: number }, total: number) {
  return { page: p.page, limit: p.limit, total, totalPages: Math.ceil(total / p.limit) };
}
