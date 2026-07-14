const PLACEHOLDER_PATTERN = /\{\{\s*([\w.]+)\s*\}\}/g;

/**
 * Replace {{path.to.value}} placeholders in a string with values resolved
 * from `payload` via dot-notation (e.g. {{payload.event.title}}). A path
 * that can't be resolved leaves the original placeholder untouched instead
 * of throwing — a typo in a template should surface as visibly wrong output,
 * not crash the action.
 */
export function interpolate(
  template: string,
  payload: Record<string, unknown>,
): string {
  return template.replace(PLACEHOLDER_PATTERN, (match, path: string) => {
    const value = resolvePath({ payload }, path);
    return stringifyValue(value) ?? match;
  });
}

/**
 * Recursively interpolate every string found in a config value — including
 * strings nested in objects and arrays — against the given payload. This is
 * what lets an action config like { subject: "Goal by {{payload.player}}" }
 * resolve without every executor re-implementing template logic.
 */
export function interpolateConfig<T>(
  config: T,
  payload: Record<string, unknown>,
): T {
  if (typeof config === 'string') {
    return interpolate(config, payload) as unknown as T;
  }

  if (Array.isArray(config)) {
    return config.map((item: unknown) =>
      interpolateConfig(item, payload),
    ) as unknown as T;
  }

  if (config !== null && typeof config === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(
      config as Record<string, unknown>,
    )) {
      result[key] = interpolateConfig(value, payload);
    }
    return result as T;
  }

  return config;
}

function resolvePath(root: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (current === undefined || current === null) {
      return undefined;
    }
    return (current as Record<string, unknown>)[segment];
  }, root);
}

/**
 * String() on an `unknown` value trips @typescript-eslint/no-base-to-string
 * because objects would stringify to "[object Object]". Numbers/booleans
 * have a meaningful toString; everything else object-shaped is rendered as
 * JSON instead.
 */
function stringifyValue(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return JSON.stringify(value);
}
