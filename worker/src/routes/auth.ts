import { Hono } from 'hono';
import { requireUser, type AppEnv } from '../app-env';
import { buildAuthorizationUrl, exchangeHandoff, handleCallback } from '../auth/google';
import { endSession, refreshSession } from '../auth/session';
import { parseBody, schemas } from '../http';

export const authRoutes = new Hono<AppEnv>()
  // Browser navigations, not XHRs — they answer with redirects.
  .get('/google/start', async (c) =>
    c.redirect(await buildAuthorizationUrl(c.env, c.req.query('returnTo'), c.req.query('nonce')), 302),
  )
  .get('/google/callback', async (c) => c.redirect(await handleCallback(c.env, c.get('db'), c.req.query()), 302))
  .post('/google/exchange', async (c) => {
    const { code, nonce } = await parseBody(c, schemas.googleExchange);
    return c.json(await exchangeHandoff(c.env, c.get('db'), code, nonce));
  })
  .post('/refresh', async (c) => {
    const { refreshToken } = await parseBody(c, schemas.refreshToken);
    return c.json(await refreshSession(c.get('db'), c.env, refreshToken));
  })
  .post('/logout', requireUser, async (c) => {
    const { refreshToken } = await parseBody(c, schemas.refreshToken);
    return c.json(await endSession(c.get('db'), c.env, c.get('user').sub, refreshToken));
  });
