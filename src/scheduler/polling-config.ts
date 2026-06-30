export const MIN_POLLING_INTERVAL_SECONDS = 30;

export type PollingChangeMode = 'any' | 'specific_field' | 'array_length';

export interface PollingConfig {
  interval: number;
  endpoint: string;
  method: string;
  headers: Record<string, string>;
  stateKey?: string;
  changeMode: PollingChangeMode;
}

const ALLOWED_METHODS = new Set([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
]);
const CHANGE_MODES = new Set<PollingChangeMode>([
  'any',
  'specific_field',
  'array_length',
]);

export function normalizePollingConfig(config: unknown): PollingConfig {
  if (!isRecord(config)) {
    throw new Error('Polling trigger configuration must be an object');
  }

  const interval = Number(config.interval ?? 60);
  if (!Number.isFinite(interval) || interval < MIN_POLLING_INTERVAL_SECONDS) {
    throw new Error(
      `Polling interval must be at least ${MIN_POLLING_INTERVAL_SECONDS} seconds`,
    );
  }

  if (typeof config.endpoint !== 'string' || config.endpoint.trim() === '') {
    throw new Error('Polling endpoint is required');
  }

  try {
    new URL(config.endpoint);
  } catch {
    throw new Error('Polling endpoint must be a valid URL');
  }

  const method = String(config.method ?? 'GET').toUpperCase();
  if (!ALLOWED_METHODS.has(method)) {
    throw new Error(`Unsupported polling method: ${method}`);
  }

  const changeMode = String(config.changeMode ?? 'any') as PollingChangeMode;
  if (!CHANGE_MODES.has(changeMode)) {
    throw new Error(
      'Polling changeMode must be any, specific_field, or array_length',
    );
  }

  const stateKey =
    typeof config.stateKey === 'string' && config.stateKey.trim() !== ''
      ? config.stateKey
      : undefined;

  if (changeMode === 'specific_field' && !stateKey) {
    throw new Error('stateKey is required for specific_field polling');
  }

  return {
    interval,
    endpoint: config.endpoint,
    method,
    headers: normalizeHeaders(config.headers),
    stateKey,
    changeMode,
  };
}

function normalizeHeaders(headers: unknown) {
  if (!isRecord(headers)) {
    return {};
  }

  return Object.entries(headers).reduce<Record<string, string>>(
    (result, [key, value]) => {
      if (value !== undefined && value !== null) {
        result[key] = String(value);
      }

      return result;
    },
    {},
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
