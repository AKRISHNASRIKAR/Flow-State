import { createHash } from 'node:crypto';
import { JSONPath } from 'jsonpath-plus';
import { isRecord, PollingChangeMode, PollingConfig } from './polling-config';
import {
  MAX_TRIGGER_PAYLOAD_BYTES,
  capForStorage,
  readBodyCapped,
} from '../common/utils/response-body';

/**
 * Change detection for SCHEDULED (polling) triggers: fetch the endpoint,
 * reduce the response to a comparable state, and decide what - if anything
 * - should fire. Pure apart from the fetch, and framework-free on purpose:
 * the NestJS PollingWorker and the Cloudflare poller both use it, so the two
 * engines can't disagree about what counts as "changed".
 */

const POLLING_TIMEOUT_MS = 15_000;

/**
 * State holds digests, never the response itself: the Cloudflare poller
 * keeps it in Durable Object storage, where one value can be at most
 * 128 KiB. 4,000 16-character digests is about 80 KB.
 */
export const MAX_TRACKED_ITEMS = 4_000;
const DIGEST_CHARS = 16;

type JsonPathJson = null | boolean | number | string | object | unknown[];

export interface PollState {
  mode: PollingChangeMode;
  /**
   * 2 = digests. States written before it (no `version`) held the raw
   * comparison value and, for array_length, every item; they're converted
   * on read so an upgrade doesn't fire or miss anything.
   */
  version?: 2;
  /** A digest of the compared value; for array_length, the item count. */
  comparison: unknown;
  /** array_length: digests of the items in the last response. */
  seen?: string[];
  /** Legacy (pre-version-2) array_length state only. */
  items?: unknown[];
}

export type PollOutcome =
  /** First successful poll: nothing to compare against yet. */
  | { kind: 'baseline'; state: PollState }
  | { kind: 'unchanged'; state: PollState }
  /** Each payload starts one run. */
  | {
      kind: 'changed';
      state: PollState;
      payloads: unknown[];
      snapshot: unknown;
    };

export async function fetchPollEndpoint(
  config: PollingConfig,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), POLLING_TIMEOUT_MS);

  try {
    const response = await fetch(config.endpoint, {
      method: config.method,
      headers: config.headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    return (await readBodyCapped(response)).body;
  } finally {
    clearTimeout(timeout);
  }
}

/** Throws when an array_length response has more items than can be tracked. */
export function evaluatePoll(
  config: PollingConfig,
  responseBody: unknown,
  lastState: PollState | null,
): PollOutcome {
  const state = buildState(config, responseBody);

  // A changed mode compares unlike things: start again from a baseline.
  if (!lastState || lastState.mode !== config.changeMode) {
    return { kind: 'baseline', state };
  }
  const previous = upgradeState(lastState);

  // array_length fires once per item not in the last response. Comparing
  // the set rather than the count matters: a feed that always returns its
  // latest 20 never changes length, yet has new items.
  let payloads: unknown[];
  if (config.changeMode === 'array_length') {
    const seen = new Set(previous.seen ?? []);
    const items = extractArray(responseBody, config.stateKey);
    payloads = items.filter((_, i) => !seen.has(state.seen?.[i] ?? ''));
  } else {
    payloads = previous.comparison === state.comparison ? [] : [responseBody];
  }

  if (payloads.length === 0) return { kind: 'unchanged', state };

  return {
    kind: 'changed',
    state,
    payloads: payloads.map(capPayload),
    snapshot: capForStorage(responseBody).value,
  };
}

function buildState(config: PollingConfig, responseBody: unknown): PollState {
  if (config.changeMode === 'array_length') {
    const items = extractArray(responseBody, config.stateKey);
    if (items.length > MAX_TRACKED_ITEMS) {
      throw new Error(
        `The array has ${items.length} items; at most ${MAX_TRACKED_ITEMS} can be tracked. Point stateKey at a smaller list.`,
      );
    }
    return {
      mode: config.changeMode,
      version: 2,
      comparison: items.length,
      seen: items.map(digestValue),
    };
  }

  const compared =
    config.changeMode === 'specific_field'
      ? extractStateValue(responseBody, config.stateKey)
      : responseBody;

  return {
    mode: config.changeMode,
    version: 2,
    comparison: digestValue(compared),
  };
}

/**
 * Converts a pre-version-2 state to digests computed exactly as
 * `buildState` now would, so the first poll after an upgrade compares like
 * with like.
 */
function upgradeState(state: PollState): PollState {
  if (state.version === 2) return state;

  if (state.mode === 'array_length') {
    return {
      ...state,
      version: 2,
      seen: (state.items ?? []).map(digestValue),
    };
  }

  // `any` stored JSON.stringify(body) itself; specific_field the raw value.
  const comparison =
    state.mode === 'any' && typeof state.comparison === 'string'
      ? digest(state.comparison)
      : digestValue(state.comparison);
  return { ...state, version: 2, comparison };
}

/** A run's input must stay small enough to persist and carry through steps. */
function capPayload(payload: unknown): unknown {
  const capped = capForStorage(payload, MAX_TRIGGER_PAYLOAD_BYTES);
  return capped.truncated
    ? { truncated: true, bytes: capped.bytes, preview: capped.value }
    : payload;
}

function digestValue(value: unknown) {
  return digest(JSON.stringify(value) ?? 'undefined');
}

function digest(text: string) {
  return createHash('sha256').update(text).digest('hex').slice(0, DIGEST_CHARS);
}

function extractArray(responseBody: unknown, stateKey?: string): unknown[] {
  const value: unknown = stateKey
    ? extractStateValue(responseBody, stateKey)
    : responseBody;
  return Array.isArray(value) ? value : [];
}

function extractStateValue(responseBody: unknown, stateKey?: string): unknown {
  if (!stateKey) {
    return responseBody;
  }

  if (stateKey.startsWith('$')) {
    return JSONPath({
      path: stateKey,
      json: responseBody as JsonPathJson,
      wrap: false,
    });
  }

  return isRecord(responseBody) ? responseBody[stateKey] : undefined;
}
