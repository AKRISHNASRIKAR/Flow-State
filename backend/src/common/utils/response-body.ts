/**
 * Bounded reads of remote responses. HTTP_REQUEST and SCHEDULED polling
 * fetch URLs chosen by users, so a response can be any size; everything
 * read ends up in a payload that the engines persist (a D1 row, a Workflows
 * step result - both capped around 1-2 MB) and pass to every later step.
 * Framework-free: both engines import it.
 */

/** Largest response read at all; past this the request fails. */
export const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

/**
 * Largest body kept in a payload. Bigger bodies are replaced by a short
 * preview so the run still completes - and the step output says so.
 */
export const MAX_STORED_BODY_BYTES = 256 * 1024;

/**
 * Largest trigger payload (a webhook body, a polled response that starts a
 * run). Together with one stored HTTP body it stays under the ~1 MiB a
 * Cloudflare Workflows step may return.
 */
export const MAX_TRIGGER_PAYLOAD_BYTES = 512 * 1024;

const PREVIEW_CHARS = 8 * 1024;

export class ResponseTooLargeError extends Error {
  constructor(limit: number) {
    super(`Response is larger than ${Math.round(limit / 1024 / 1024)} MB`);
  }
}

/**
 * Reads the body as text, failing once it passes `maxBytes` instead of
 * buffering all of it first.
 */
export async function readTextCapped(
  response: Response,
  maxBytes = MAX_RESPONSE_BYTES,
): Promise<string> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel();
    throw new ResponseTooLargeError(maxBytes);
  }
  if (!response.body) return '';

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw new ResponseTooLargeError(maxBytes);
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/** The body parsed as JSON when the server says it is JSON, else the text. */
export async function readBodyCapped(
  response: Response,
  maxBytes = MAX_RESPONSE_BYTES,
): Promise<{ body: unknown; bytes: number }> {
  const text = await readTextCapped(response, maxBytes);
  const bytes = byteLength(text);
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json') && text.trim() !== '') {
    return { body: JSON.parse(text) as unknown, bytes };
  }
  return { body: text, bytes };
}

/**
 * `value` itself when its JSON fits in `maxBytes`, otherwise a marker with
 * a text preview - for anything about to be stored or carried in a payload.
 */
export function capForStorage(
  value: unknown,
  maxBytes = MAX_STORED_BODY_BYTES,
): { value: unknown; truncated: boolean; bytes: number } {
  const json = JSON.stringify(value) ?? '';
  const bytes = byteLength(json);
  if (bytes <= maxBytes) return { value, truncated: false, bytes };
  const text = typeof value === 'string' ? value : json;
  return { value: text.slice(0, PREVIEW_CHARS), truncated: true, bytes };
}

function byteLength(text: string) {
  return new TextEncoder().encode(text).byteLength;
}
