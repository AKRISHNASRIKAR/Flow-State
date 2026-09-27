import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppEnv } from './app-env';
import { dbFor } from './db';
import { reconcilePollers } from './engine/polling';
import type { Env } from './env';
import { HttpError, errorBody } from './http';
import { authRoutes } from './routes/auth';
import { executionRoutes } from './routes/executions';
import { adminRoutes, healthRoutes, telegramRoutes, webhookRoutes } from './routes/public';
import { workflowRoutes } from './routes/workflows';

// Durable Objects and the Workflow class must be exported from the entry point.
export { OneTimeStore } from './durable/one-time-store';
export { Poller } from './durable/poller';
export { RateLimiter } from './durable/rate-limiter';
export { RunWorkflow } from './engine/run-workflow';

const app = new Hono<AppEnv>();

app.use(
  '*',
  cors({
    origin: (origin, c) => {
      const allowed = (c.env.CORS_ORIGIN ?? '').split(',').map((o: string) => o.trim());
      return allowed.includes(origin) ? origin : null;
    },
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Admin-Secret'],
  }),
);

// The D1 handle every route reads through `c.get('db')`. D1 has no
// connection to open or close, so this is only a convenience.
app.use('*', async (c, next) => {
  c.set('db', dbFor(c.env));
  await next();
});

app.route('/auth', authRoutes);
app.route('/workflows', workflowRoutes);
app.route('/executions', executionRoutes);
app.route('/webhooks', webhookRoutes);
app.route('/telegram', telegramRoutes);
app.route('/health', healthRoutes);
app.route('/admin', adminRoutes);

app.onError((error, c) => {
  if (error instanceof HttpError) return c.json(error.body(), error.status);
  console.error(`${c.req.method} ${c.req.path} failed`, error);
  return c.json(errorBody(500, 'Internal server error'), 500);
});

app.notFound((c) => c.json(errorBody(404, `Cannot ${c.req.method} ${c.req.path}`), 404));

export default {
  fetch: app.fetch,
  // Cron (wrangler.jsonc): re-arm pollers in case an alarm was ever lost.
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(reconcilePollers(env));
  },
} satisfies ExportedHandler<Env>;
