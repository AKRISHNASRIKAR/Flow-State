import { hashRefreshToken, refreshTokenMatches } from './refresh-token-hash';

describe('refresh token hashing', () => {
  it('is a stable SHA-256 hex digest', () => {
    expect(hashRefreshToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('matches only the token it was made from', () => {
    const stored = hashRefreshToken('token-a');
    expect(refreshTokenMatches('token-a', stored)).toBe(true);
    expect(refreshTokenMatches('token-b', stored)).toBe(false);
  });

  it('never matches a pre-migration argon2 hash', () => {
    expect(
      refreshTokenMatches(
        'token-a',
        '$argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHQ$aGFzaGhhc2g',
      ),
    ).toBe(false);
  });
});
