import { createHash, createHmac, timingSafeEqual } from 'crypto';

/**
 * Webhook authenticity and dedup, shared by the NestJS backend and worker/.
 * Framework-free on purpose. HIGH-RISK: see AGENTS.md §19 before editing.
 */

/** Header senders put the signature in. Load-bearing — never rename. */
export const SIGNATURE_HEADER = 'x-flowforge-signature';

/**
 * The sender computes `sha256=HMAC-SHA256(rawBody, secret)` as hex. It must
 * be the raw request bytes: re-serialised JSON (different whitespace or key
 * order) would never verify. Compared with timingSafeEqual — never `===`,
 * which leaks how many leading characters matched.
 */
export function isValidWebhookSignature(
  rawBody: Uint8Array,
  secret: string,
  signature: string,
): boolean {
  const expected = Buffer.from(
    'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex'),
  );
  const received = Buffer.from(signature);
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}

/**
 * Idempotency key when the sender doesn't supply X-Idempotency-Key.
 * Deterministic — no timestamp — so identical payloads map to the same key
 * across real retry windows (GitHub retries at 60s, Stripe at 30–90s).
 * Senders with legitimately identical payloads must send their own key.
 */
export function webhookFingerprint(
  workflowId: string,
  parsedBody: unknown,
): string {
  return createHash('sha256')
    .update(workflowId + JSON.stringify(parsedBody))
    .digest('hex');
}
