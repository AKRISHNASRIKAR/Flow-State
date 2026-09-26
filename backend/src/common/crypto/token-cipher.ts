import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
// 96-bit IV is GCM's native size; anything else costs an extra GHASH pass.
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
// Versioned so a future key rotation can tell old ciphertexts from new ones.
const FORMAT_VERSION = 'v1';

/**
 * Encrypts OAuth tokens at rest. AES-256-GCM is authenticated, so a
 * tampered or truncated ciphertext fails to decrypt instead of yielding
 * garbage. Output format: `v1:<iv>:<tag>:<ciphertext>`, each part base64.
 */
export class TokenCipher {
  private readonly key: Buffer;

  constructor(base64Key: string) {
    const key = Buffer.from(base64Key, 'base64');
    if (key.length !== KEY_BYTES) {
      throw new Error(
        `CREDENTIALS_ENCRYPTION_KEY must be ${KEY_BYTES} bytes, base64-encoded (got ${key.length} bytes). ` +
          'Generate one with: openssl rand -base64 32',
      );
    }
    this.key = key;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv, {
      authTagLength: AUTH_TAG_BYTES,
    });
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    return [
      FORMAT_VERSION,
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      ciphertext.toString('base64'),
    ].join(':');
  }

  decrypt(payload: string): string {
    const [version, iv, tag, ciphertext] = payload.split(':');
    if (version !== FORMAT_VERSION || !iv || !tag || ciphertext === undefined) {
      throw new Error('Unrecognised encrypted token format');
    }
    const decipher = createDecipheriv(
      ALGORITHM,
      this.key,
      Buffer.from(iv, 'base64'),
      { authTagLength: AUTH_TAG_BYTES },
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}
