import { JSONPath } from 'jsonpath-plus';
import { isRecord, PollingChangeMode, PollingConfig } from './polling-config';

/**
 * Change detection for SCHEDULED (polling) triggers: fetch the endpoint,
 * reduce the response to a comparable state, and decide what — if anything
 * — should fire. Pure apart from the fetch, and framework-free on purpose:
 * the NestJS PollingWorker and the Cloudflare poller both use it, so the two
 * engines can't disagree about what counts as "changed".
 */

const POLLING_TIMEOUT_MS = 15_000;

type JsonPathJson = null | boolean | number | string | object | unknown[];

export interface PollState {
  mode: PollingChangeMode;
  comparison: unknown;
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
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      return (await response.json()) as unknown;
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

export function evaluatePoll(
  config: PollingConfig,
  responseBody: unknown,
  lastState: PollState | null,
): PollOutcome {
  const state = buildState(config, responseBody);

  if (!lastState) return { kind: 'baseline', state };
  if (statesEqual(config.changeMode, lastState, state))
    return { kind: 'unchanged', state };

  // array_length fires once per *new* item; the other modes fire once with
  // the whole response.
  const payloads =
    config.changeMode === 'array_length'
      ? getNewItems(lastState.items ?? [], state.items ?? [])
      : [responseBody];

  return { kind: 'changed', state, payloads, snapshot: responseBody };
}

function buildState(config: PollingConfig, responseBody: unknown): PollState {
  if (config.changeMode === 'array_length') {
    const items = extractArray(responseBody, config.stateKey);
    return { mode: config.changeMode, comparison: items.length, items };
  }

  const comparison =
    config.changeMode === 'specific_field'
      ? extractStateValue(responseBody, config.stateKey)
      : JSON.stringify(responseBody);

  return { mode: config.changeMode, comparison };
}

function statesEqual(
  changeMode: PollingChangeMode,
  lastState: PollState,
  newState: PollState,
) {
  if (changeMode === 'array_length') {
    return lastState.comparison === newState.comparison;
  }
  return (
    JSON.stringify(lastState.comparison) === JSON.stringify(newState.comparison)
  );
}

function getNewItems(previousItems: unknown[], currentItems: unknown[]) {
  const previous = new Set(previousItems.map((item) => JSON.stringify(item)));
  return currentItems.filter((item) => !previous.has(JSON.stringify(item)));
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
