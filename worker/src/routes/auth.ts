import { Hono, type Context } from 'hono';
import {
  clearedRefreshCookie,
  pickRefreshToken,
  refreshCookie,
} from '../../../backend/src/auth/refresh-cookie';
import { requireUser, type AppEnv } from '../app-env';
import { buildAuthorizationUrl, exchangeHandoff, handleCallback } from '../auth/google';
import { endSession, refreshSession } from '../auth/session';
import { HttpError, parseBody, schemas, unauthorized } from '../http';

// The refresh token goes out only as an httpOnly cookie (see
// backend/src/auth/refresh-cookie.ts); response bodies carry the access
// token alone.

const isHttps = (c: Context<AppEnv>) => new URL(c.req.url).protocol === 'https:';

export const authRoutes = new Hono<AppEnv>()
  // Browser navigations, not XHRs - they answer with redirects.
  .get('/google/start', async (c) =>
    c.redirect(await buildAuthorizationUrl(c.env, c.req.query('returnTo'), c.req.query('nonce')), 302),
  )
  .get('/google/callback', async (c) => c.redirect(await handleCallback(c.env, c.get('db'), c.req.query()), 302))
  .post('/google/exchange', async (c) => {
    const { code, nonce } = await parseBody(c, schemas.googleExchange);
    const { refreshToken, ...session } = await exchangeHandoff(c.env, c.get('db'), code, nonce);
    c.header('Set-Cookie', refreshCookie(refreshToken, isHttps(c)));
    return c.json(session);
  })
  .post('/refresh', async (c) => {
    const body = await parseBody(c, schemas.refreshToken);
    const presented = pickRefreshToken(c.req.header('cookie'), body.refreshToken);
    if (!presented) throw unauthorized('Invalid refresh token');
    try {
      const { refreshToken, ...session } = await refreshSession(c.get('db'), c.env, presented);
      c.header('Set-Cookie', refreshCookie(refreshToken, isHttps(c)));
      return c.json(session);
    } catch (error) {
      // A rejected token is useless - drop the cookie with the 401. Anything
      // else (D1 unreachable) leaves it: the session may still be good.
      if (error instanceof HttpError && error.status === 401) {
        c.header('Set-Cookie', clearedRefreshCookie(isHttps(c)));
        return c.json(error.body(), 401);
      }
      throw error;
    }
  })
  .post('/logout', requireUser, async (c) => {
    const body = await parseBody(c, schemas.refreshToken);
    const presented = pickRefreshToken(c.req.header('cookie'), body.refreshToken);
    c.header('Set-Cookie', clearedRefreshCookie(isHttps(c)));
    // No token, or one already spent or expired: nothing left to revoke,
    // and the browser is signed out either way.
    if (!presented) return c.json({ success: true });
    try {
      return c.json(await endSession(c.get('db'), c.env, c.get('user').sub, presented));
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) return c.json({ success: true });
      throw error;
    }
  });
