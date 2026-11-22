// {{{payload.x}}} (triple braces) inserts the value raw; {{payload.x}} is
// escaped for where it lands. Triple is tried first so it isn't read as a
// double placeholder wrapped in stray braces.
const PLACEHOLDER_PATTERN =
  /\{\{\{\s*([\w.]+)\s*\}\}\}|\{\{\s*([\w.]+)\s*\}\}/g;

/**
 * Where an interpolated value ends up, which decides how it is escaped.
 * Payloads come from webhook senders and polled APIs - outside parties - so
 * a value must never be able to change the structure around it: close a
 * JSON string and add fields, add a query parameter, or inject a link into
 * an email.
 *
 * - `text`: inserted as is (subjects, log lines, header values - fetch
 *   itself rejects CR/LF in headers).
 * - `html`: `& < > " '` escaped (email bodies, Telegram's HTML mode).
 * - `markdown`: Telegram's legacy Markdown specials backslash-escaped.
 * - `url`: percent-encoded once the template is past the host, so a value
 *   can fill a path segment or query value but not add another one. A
 *   placeholder in the scheme/host position (e.g. a whole `{{payload.url}}`)
 *   stays raw - that is the user choosing the destination.
 * - `json`: inside a JSON string the value is string-escaped; outside one it
 *   is inserted as a JSON literal (a string becomes `"…"`).
 */
export type TemplateContext = 'text' | 'html' | 'markdown' | 'url' | 'json';

/** Per top-level config field; fields not listed are `text`. */
export type TemplateContexts = Partial<Record<string, TemplateContext>>;

/**
 * Replace {{path.to.value}} placeholders in a string with values resolved
 * from `payload` via dot-notation (e.g. {{payload.event.title}}). A path
 * that can't be resolved leaves the original placeholder untouched instead
 * of throwing - a typo in a template should surface as visibly wrong output,
 * not crash the action.
 */
export function interpolate(
  template: string,
  payload: Record<string, unknown>,
  context: TemplateContext = 'text',
): string {
  const scanner = new LiteralScanner(context);
  let out = '';
  let last = 0;

  for (const match of template.matchAll(PLACEHOLDER_PATTERN)) {
    const index = match.index;
    const literal = template.slice(last, index);
    scanner.feed(literal);
    out += literal;
    last = index + match[0].length;

    const raw = match[1] !== undefined;
    const value = resolvePath({ payload }, match[1] ?? match[2]);
    if (value === undefined || value === null) {
      out += match[0];
      continue;
    }
    out += raw ? stringifyValue(value) : scanner.escape(value);
  }

  return out + template.slice(last);
}

/**
 * Recursively interpolate every string found in a config value - including
 * strings nested in objects and arrays - against the given payload. This is
 * what lets an action config like { subject: "Goal by {{payload.player}}" }
 * resolve without every executor re-implementing template logic. A field's
 * context (see `TemplateContexts`) applies to everything nested under it.
 */
export function interpolateConfig<T>(
  config: T,
  payload: Record<string, unknown>,
  contexts: TemplateContexts = {},
): T {
  if (config !== null && typeof config === 'object' && !Array.isArray(config)) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(
      config as Record<string, unknown>,
    )) {
      result[key] = interpolateValue(value, payload, contexts[key] ?? 'text');
    }
    return result as T;
  }
  return interpolateValue(config, payload, 'text');
}

function interpolateValue<T>(
  value: T,
  payload: Record<string, unknown>,
  context: TemplateContext,
): T {
  if (typeof value === 'string') {
    return interpolate(value, payload, context) as unknown as T;
  }

  if (Array.isArray(value)) {
    return value.map((item: unknown) =>
      interpolateValue(item, payload, context),
    ) as unknown as T;
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(
      value as Record<string, unknown>,
    )) {
      result[key] = interpolateValue(item, payload, context);
    }
    return result as T;
  }

  return value;
}

/**
 * Follows the template's literal text so `url` and `json` know what a
 * placeholder sits inside: the host or the path, a JSON string or not.
 */
class LiteralScanner {
  private pastHost = false;
  private inJsonString = false;
  private escaped = false;

  constructor(private readonly context: TemplateContext) {}

  feed(literal: string) {
    if (this.context === 'url') this.feedUrl(literal);
    if (this.context === 'json') this.feedJson(literal);
  }

  escape(value: unknown): string {
    switch (this.context) {
      case 'html':
        return escapeHtml(stringifyValue(value));
      case 'markdown':
        return stringifyValue(value).replace(/[_*`[\\]/g, '\\$&');
      case 'url':
        return this.pastHost
          ? encodeURIComponent(stringifyValue(value))
          : stringifyValue(value);
      case 'json':
        return this.inJsonString
          ? JSON.stringify(stringifyValue(value)).slice(1, -1)
          : JSON.stringify(value);
      default:
        return stringifyValue(value);
    }
  }

  private feedUrl(literal: string) {
    for (let i = 0; i < literal.length && !this.pastHost; i++) {
      // The `//` of `https://` opens the host, it doesn't end it.
      if (literal.startsWith('://', i)) {
        i += 2;
        continue;
      }
      if ('/?#'.includes(literal[i])) this.pastHost = true;
    }
  }

  private feedJson(literal: string) {
    for (const ch of literal) {
      if (this.escaped) {
        this.escaped = false;
      } else if (ch === '\\' && this.inJsonString) {
        this.escaped = true;
      } else if (ch === '"') {
        this.inJsonString = !this.inJsonString;
      }
    }
  }
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolvePath(root: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    // Own properties only: `{{payload.constructor}}` must not reach into
    // the prototype chain.
    if (
      current === null ||
      typeof current !== 'object' ||
      !Object.prototype.hasOwnProperty.call(current, segment)
    ) {
      return undefined;
    }
    return (current as Record<string, unknown>)[segment];
  }, root);
}

/**
 * String() on an `unknown` value trips @typescript-eslint/no-base-to-string
 * because objects would stringify to "[object Object]". Numbers/booleans
 * have a meaningful toString; everything else object-shaped is rendered as
 * JSON instead. Callers have already ruled out null and undefined.
 */
function stringifyValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return JSON.stringify(value) ?? '';
}
