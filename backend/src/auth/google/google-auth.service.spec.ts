import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import Redis from 'ioredis';
import { TokenCipher } from '../../common/crypto/token-cipher';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../shared/audit-log.service';
import { AuthService } from '../auth.service';
import { GoogleAuthService } from './google-auth.service';
import { pkceChallenge } from './google-oauth';

const CLIENT_ID = 'client-123.apps.googleusercontent.com';
const ENCRYPTION_KEY = randomBytes(32).toString('base64');
const NONCE = 'nonce-from-session-storage-0001';
const CONFIGURED = {
  GOOGLE_CLIENT_ID: CLIENT_ID,
  GOOGLE_CLIENT_SECRET: 'secret',
  CREDENTIALS_ENCRYPTION_KEY: ENCRYPTION_KEY,
  FRONTEND_URL: 'http://app.test',
  GOOGLE_REDIRECT_URI: 'http://api.test/auth/google/callback',
};

interface StoredConnection {
  id: string;
  userId: string;
}
interface StoredUser {
  id: string;
  email: string;
  connections: StoredConnection[];
}

function idToken(overrides: Record<string, unknown> = {}) {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'RS256' })}.${encode({
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    exp: Date.now() / 1000 + 3600,
    sub: 'google-sub-1',
    email: 'ada@example.com',
    email_verified: true,
    name: 'Ada',
    ...overrides,
  })}.sig`;
}

function tokenResponse(overrides: Record<string, unknown> = {}) {
  return {
    access_token: 'ya29.access',
    refresh_token: '1//refresh',
    expires_in: 3599,
    scope: 'openid https://www.googleapis.com/auth/userinfo.email',
    token_type: 'Bearer',
    id_token: idToken(),
    ...overrides,
  };
}

function setup(
  options: {
    env?: Record<string, string>;
    connection?: StoredConnection | null;
    userByEmail?: StoredUser | null;
  } = {},
) {
  const env: Record<string, string> = options.env ?? CONFIGURED;
  const config = {
    get: (key: string, fallback?: string) => env[key] ?? fallback,
  } as unknown as ConfigService;

  const store = new Map<string, string>();
  const redis = {
    set: jest.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve('OK');
    }),
    getdel: jest.fn((key: string) => {
      const value = store.get(key) ?? null;
      store.delete(key);
      return Promise.resolve(value);
    }),
  };

  const writes = {
    connectionUpdates: [] as Record<string, unknown>[],
    connectionCreates: [] as Record<string, unknown>[],
    userCreates: [] as Record<string, unknown>[],
  };
  const tx = {
    connection: {
      findUnique: jest.fn().mockResolvedValue(options.connection ?? null),
      update: jest.fn((args: { data: Record<string, unknown> }) => {
        writes.connectionUpdates.push(args.data);
        return Promise.resolve({});
      }),
      create: jest.fn((args: { data: Record<string, unknown> }) => {
        writes.connectionCreates.push(args.data);
        return Promise.resolve({});
      }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue(options.userByEmail ?? null),
      create: jest.fn((args: { data: Record<string, unknown> }) => {
        writes.userCreates.push(args.data);
        return Promise.resolve({ id: 'new-user' });
      }),
    },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  };

  const startSession = jest.fn((userId: string) =>
    Promise.resolve({ accessToken: `session-for-${userId}` }),
  );
  const auditEvents: string[] = [];
  const auditLog = {
    log: jest.fn((_u: string, _a: string, meta: { event: string }) => {
      auditEvents.push(meta.event);
    }),
  };

  const service = new GoogleAuthService(
    config,
    prisma as unknown as PrismaService,
    { startSession } as unknown as AuthService,
    auditLog as unknown as AuditLogService,
    redis as unknown as Redis,
  );

  return { service, writes, startSession, auditEvents, store };
}

let fetchMock: jest.SpyInstance<
  ReturnType<typeof fetch>,
  Parameters<typeof fetch>
>;
function mockTokenEndpoint(status: number, body: unknown) {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

beforeEach(() => {
  fetchMock = jest.spyOn(global, 'fetch');
  mockTokenEndpoint(200, tokenResponse());
});
afterEach(() => fetchMock.mockRestore());

/** Runs start → Google → callback and returns the dashboard redirect. */
async function signIn(
  ctx: ReturnType<typeof setup>,
  returnTo: unknown = '/workflows/abc',
) {
  const authorizeUrl = new URL(
    await ctx.service.buildAuthorizationUrl(returnTo, NONCE),
  );
  const state = authorizeUrl.searchParams.get('state');
  return {
    authorizeUrl,
    state,
    redirect: new URL(
      await ctx.service.handleCallback({ code: 'auth-code', state }),
    ),
  };
}

describe('GoogleAuthService.buildAuthorizationUrl', () => {
  it('refuses with 503 when Google is not configured', async () => {
    const { service } = setup({ env: {} });
    await expect(
      service.buildAuthorizationUrl('/workflows', NONCE),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('refuses with 503 when the encryption key is malformed', async () => {
    const { service } = setup({
      env: { ...CONFIGURED, CREDENTIALS_ENCRYPTION_KEY: 'too-short' },
    });
    await expect(
      service.buildAuthorizationUrl('/workflows', NONCE),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('requires a nonce', async () => {
    const { service } = setup();
    await expect(
      service.buildAuthorizationUrl('/workflows', 'short'),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('asks Google for identity scopes only, with PKCE', async () => {
    const ctx = setup();
    const url = new URL(
      await ctx.service.buildAuthorizationUrl('/workflows', NONCE),
    );
    const params = url.searchParams;

    expect(url.origin + url.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    expect(params.get('client_id')).toBe(CLIENT_ID);
    expect(params.get('redirect_uri')).toBe(CONFIGURED.GOOGLE_REDIRECT_URI);
    expect(params.get('scope')).toBe('openid email profile');
    expect(params.get('code_challenge_method')).toBe('S256');
    expect(params.get('access_type')).toBe('offline');
    expect(params.get('state')).toBeTruthy();
  });
});

describe('GoogleAuthService.handleCallback', () => {
  it('creates a new user, encrypts tokens, and hands off to the dashboard', async () => {
    const ctx = setup();
    const { authorizeUrl, redirect } = await signIn(ctx);

    expect(redirect.origin + redirect.pathname).toBe(
      'http://app.test/auth/callback',
    );
    expect(redirect.searchParams.get('returnTo')).toBe('/workflows/abc');
    expect(redirect.searchParams.get('code')).toBeTruthy();

    // The verifier sent to Google matches the challenge sent at start.
    const init = fetchMock.mock.calls[0][1];
    const body = init?.body as URLSearchParams;
    expect(pkceChallenge(body.get('code_verifier') ?? '')).toBe(
      authorizeUrl.searchParams.get('code_challenge'),
    );

    const created = ctx.writes.userCreates[0] as {
      email: string;
      connections: {
        create: { accessTokenEnc: string; refreshTokenEnc: string };
      };
    };
    expect(created.email).toBe('ada@example.com');
    const { accessTokenEnc, refreshTokenEnc } = created.connections.create;
    expect(accessTokenEnc).not.toContain('ya29');
    const cipher = new TokenCipher(ENCRYPTION_KEY);
    expect(cipher.decrypt(accessTokenEnc)).toBe('ya29.access');
    expect(cipher.decrypt(refreshTokenEnc)).toBe('1//refresh');
    expect(ctx.auditEvents).toEqual(['auth.google.registered']);
  });

  it('drops an off-site returnTo', async () => {
    const { redirect } = await signIn(setup(), '//evil.com');
    expect(redirect.searchParams.get('returnTo')).toBe('/workflows');
  });

  it('rejects a replayed callback (state is single-use)', async () => {
    const ctx = setup();
    const { state } = await signIn(ctx);
    const replay = new URL(
      await ctx.service.handleCallback({ code: 'auth-code', state }),
    );
    expect(replay.pathname).toBe('/login');
    expect(replay.searchParams.get('error')).toBe('state_expired');
  });

  it('reports a cancelled consent screen', async () => {
    const url = new URL(
      await setup().service.handleCallback({ error: 'access_denied' }),
    );
    expect(url.searchParams.get('error')).toBe('access_denied');
  });

  it('refuses an unverified Google email', async () => {
    mockTokenEndpoint(
      200,
      tokenResponse({ id_token: idToken({ email_verified: false }) }),
    );
    const ctx = setup();
    const { redirect } = await signIn(ctx);
    expect(redirect.searchParams.get('error')).toBe('email_unverified');
    expect(ctx.writes.userCreates).toHaveLength(0);
  });

  it('reports google_failed when the token exchange fails', async () => {
    mockTokenEndpoint(400, { error: 'invalid_grant' });
    const { redirect } = await signIn(setup());
    expect(redirect.searchParams.get('error')).toBe('google_failed');
  });

  it('updates a returning account without discarding its refresh token', async () => {
    mockTokenEndpoint(200, tokenResponse({ refresh_token: undefined }));
    const ctx = setup({ connection: { id: 'conn-1', userId: 'user-1' } });
    await signIn(ctx);

    expect(ctx.writes.userCreates).toHaveLength(0);
    expect(ctx.writes.connectionUpdates[0]).not.toHaveProperty(
      'refreshTokenEnc',
    );
    expect(ctx.writes.connectionUpdates[0]).toHaveProperty('accessTokenEnc');
    expect(ctx.auditEvents).toEqual([]);
  });

  it('links a pre-Google account with the same verified email', async () => {
    const ctx = setup({
      userByEmail: {
        id: 'legacy-user',
        email: 'ada@example.com',
        connections: [],
      },
    });
    await signIn(ctx);

    expect(ctx.writes.userCreates).toHaveLength(0);
    expect(ctx.writes.connectionCreates[0]).toMatchObject({
      userId: 'legacy-user',
      providerAccountId: 'google-sub-1',
    });
    expect(ctx.auditEvents).toEqual(['auth.google.linked']);
  });

  it('never re-points an email already tied to another Google account', async () => {
    const ctx = setup({
      userByEmail: {
        id: 'user-2',
        email: 'ada@example.com',
        connections: [{ id: 'other-google', userId: 'user-2' }],
      },
    });
    const { redirect } = await signIn(ctx);

    expect(redirect.searchParams.get('error')).toBe('account_conflict');
    expect(ctx.writes.connectionCreates).toHaveLength(0);
  });
});

describe('GoogleAuthService.exchangeHandoff', () => {
  it('starts a session for the signed-in user, once', async () => {
    const ctx = setup();
    const { redirect } = await signIn(ctx);
    const code = redirect.searchParams.get('code') ?? '';

    await expect(ctx.service.exchangeHandoff(code, NONCE)).resolves.toEqual({
      accessToken: 'session-for-new-user',
    });
    await expect(ctx.service.exchangeHandoff(code, NONCE)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a handoff from a different tab (nonce mismatch) and burns it', async () => {
    const ctx = setup();
    const { redirect } = await signIn(ctx);
    const code = redirect.searchParams.get('code') ?? '';

    await expect(
      ctx.service.exchangeHandoff(code, 'attacker-supplied-nonce-xx'),
    ).rejects.toThrow(UnauthorizedException);
    await expect(ctx.service.exchangeHandoff(code, NONCE)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(ctx.startSession).not.toHaveBeenCalled();
  });
});
