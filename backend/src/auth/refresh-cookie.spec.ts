import {
  REFRESH_COOKIE_NAME,
  clearedRefreshCookie,
  pickRefreshToken,
  readRefreshCookie,
  refreshCookie,
} from './refresh-cookie';

describe('refresh cookie', () => {
  it('is httpOnly, Strict, scoped to the proxied auth path', () => {
    const cookie = refreshCookie('tok.en=', true);
    expect(cookie).toContain(`${REFRESH_COOKIE_NAME}=tok.en=`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/api/auth');
    expect(cookie).toContain('Secure');
    expect(refreshCookie('t', false)).not.toContain('Secure');
    expect(clearedRefreshCookie(true)).toContain('Max-Age=0');
  });

  it('reads its own cookie among others, keeping "=" inside the value', () => {
    expect(
      readRefreshCookie(`theme=dark; ${REFRESH_COOKIE_NAME}=a.b=c; other=1`),
    ).toBe('a.b=c');
    expect(readRefreshCookie('theme=dark')).toBeUndefined();
    expect(readRefreshCookie(`${REFRESH_COOKIE_NAME}=`)).toBeUndefined();
  });

  it('prefers the cookie, falling back to a migrating body token', () => {
    const header = `${REFRESH_COOKIE_NAME}=from-cookie`;
    expect(pickRefreshToken(header, 'from-body')).toBe('from-cookie');
    expect(pickRefreshToken(undefined, 'from-body')).toBe('from-body');
    expect(pickRefreshToken(undefined, '')).toBeUndefined();
  });
});
