import { createHash } from 'crypto';
import {
  isGoogleTokenResponse,
  pkceChallenge,
  readIdTokenFromTokenEndpoint,
  sanitizeReturnTo,
} from './google-oauth';

const CLIENT_ID = 'client-123.apps.googleusercontent.com';
const NOW = new Date('2026-09-26T12:00:00Z');

function fakeIdToken(claims: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'RS256' })}.${encode(claims)}.signature`;
}

const VALID_CLAIMS = {
  iss: 'https://accounts.google.com',
  aud: CLIENT_ID,
  exp: NOW.getTime() / 1000 + 3600,
  sub: '1098765',
  email: 'Ada@Example.com',
  email_verified: true,
  name: 'Ada',
};

describe('sanitizeReturnTo', () => {
  it.each([
    ['/workflows/abc', '/workflows/abc'],
    ['/executions?status=FAILED', '/executions?status=FAILED'],
  ])('keeps same-origin path %s', (input, expected) => {
    expect(sanitizeReturnTo(input)).toBe(expected);
  });

  it.each([
    'https://evil.com',
    '//evil.com',
    '/\\evil.com',
    'workflows',
    '',
    undefined,
    ['/workflows'],
  ])('falls back to /workflows for %p', (input) => {
    expect(sanitizeReturnTo(input)).toBe('/workflows');
  });
});

describe('pkceChallenge', () => {
  it('is the base64url SHA-256 of the verifier (RFC 7636 S256)', () => {
    // Test vector from RFC 7636 Appendix B.
    expect(pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
    expect(pkceChallenge('x')).toBe(
      createHash('sha256').update('x').digest('base64url'),
    );
  });
});

describe('isGoogleTokenResponse', () => {
  const base = {
    access_token: 'at',
    expires_in: 3599,
    scope: 'openid email',
    id_token: 'x.y.z',
    token_type: 'Bearer',
  };

  it('accepts a response with or without a refresh token', () => {
    expect(isGoogleTokenResponse(base)).toBe(true);
    expect(isGoogleTokenResponse({ ...base, refresh_token: 'rt' })).toBe(true);
  });

  it('rejects an error body or missing fields', () => {
    expect(isGoogleTokenResponse({ error: 'invalid_grant' })).toBe(false);
    expect(isGoogleTokenResponse({ ...base, id_token: undefined })).toBe(false);
    expect(isGoogleTokenResponse({ ...base, refresh_token: 42 })).toBe(false);
    expect(isGoogleTokenResponse(null)).toBe(false);
  });
});

describe('readIdTokenFromTokenEndpoint', () => {
  it('returns the identity with a normalised email', () => {
    expect(
      readIdTokenFromTokenEndpoint(fakeIdToken(VALID_CLAIMS), CLIENT_ID, NOW),
    ).toEqual({
      sub: '1098765',
      email: 'ada@example.com',
      emailVerified: true,
      name: 'Ada',
    });
  });

  it('accepts the bare-host issuer Google also uses', () => {
    const token = fakeIdToken({ ...VALID_CLAIMS, iss: 'accounts.google.com' });
    expect(readIdTokenFromTokenEndpoint(token, CLIENT_ID, NOW).sub).toBe(
      '1098765',
    );
  });

  it('treats a missing email_verified as unverified', () => {
    const { email_verified: _omit, ...claims } = VALID_CLAIMS;
    void _omit;
    expect(
      readIdTokenFromTokenEndpoint(fakeIdToken(claims), CLIENT_ID, NOW)
        .emailVerified,
    ).toBe(false);
  });

  it.each([
    [{ iss: 'https://evil.example' }, 'unexpected issuer'],
    [{ aud: 'someone-else' }, 'different client'],
    [{ exp: NOW.getTime() / 1000 - 1 }, 'expired'],
    [{ sub: undefined }, 'missing sub or email'],
  ])('rejects %p', (override, message) => {
    const token = fakeIdToken({ ...VALID_CLAIMS, ...override });
    expect(() => readIdTokenFromTokenEndpoint(token, CLIENT_ID, NOW)).toThrow(
      message,
    );
  });

  it('rejects a malformed token', () => {
    expect(() =>
      readIdTokenFromTokenEndpoint('not-a-jwt', CLIENT_ID, NOW),
    ).toThrow('Malformed');
  });
});
