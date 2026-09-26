import { randomBytes } from 'crypto';
import { TokenCipher } from './token-cipher';

const KEY = randomBytes(32).toString('base64');

describe('TokenCipher', () => {
  it('round-trips a token', () => {
    const cipher = new TokenCipher(KEY);
    expect(cipher.decrypt(cipher.encrypt('ya29.secret-token'))).toBe(
      'ya29.secret-token',
    );
  });

  it('never emits the plaintext and uses a fresh IV each time', () => {
    const cipher = new TokenCipher(KEY);
    const a = cipher.encrypt('same');
    const b = cipher.encrypt('same');
    expect(a).not.toContain('same');
    expect(a).not.toBe(b);
    expect(a.startsWith('v1:')).toBe(true);
  });

  it('rejects a tampered ciphertext', () => {
    const cipher = new TokenCipher(KEY);
    const [v, iv, tag, ct] = cipher.encrypt('token').split(':');
    const flipped = Buffer.from(ct, 'base64');
    flipped[0] ^= 0xff;
    expect(() =>
      cipher.decrypt([v, iv, tag, flipped.toString('base64')].join(':')),
    ).toThrow();
  });

  it('rejects decryption under a different key', () => {
    const encrypted = new TokenCipher(KEY).encrypt('token');
    const other = new TokenCipher(randomBytes(32).toString('base64'));
    expect(() => other.decrypt(encrypted)).toThrow();
  });

  it('rejects an unknown format', () => {
    expect(() => new TokenCipher(KEY).decrypt('plain-token')).toThrow(
      'Unrecognised encrypted token format',
    );
  });

  it('refuses a key of the wrong length', () => {
    expect(() => new TokenCipher(randomBytes(16).toString('base64'))).toThrow(
      'must be 32 bytes',
    );
  });
});
