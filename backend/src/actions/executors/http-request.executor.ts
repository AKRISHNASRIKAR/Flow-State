import {
  ActionResult,
  IActionExecutor,
} from '../interfaces/action-executor.interface';
import type { TemplateContexts } from '../../common/utils/template.util';
import {
  ResponseTooLargeError,
  capForStorage,
  readBodyCapped,
} from '../../common/utils/response-body';
import { isRetryableStatus } from './retryable-status';

const HTTP_TIMEOUT_MS = 10_000;

interface HttpRequestConfig {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export class HttpRequestExecutor implements IActionExecutor {
  /**
   * The URL is percent-encoded past the host, and a JSON body is escaped as
   * JSON, so a payload value fills its slot without adding parameters or
   * fields of its own.
   */
  templateContexts(config: Record<string, unknown>): TemplateContexts {
    return {
      url: 'url',
      body: looksLikeJson(config) ? 'json' : 'text',
    };
  }

  async execute(config: Record<string, unknown>): Promise<ActionResult> {
    const { url, method, headers, body } =
      config as unknown as HttpRequestConfig;
    const httpMethod = (method ?? 'GET').toUpperCase();

    if (!isHttpUrl(url)) {
      return {
        success: false,
        error: `HTTP request failed: not a valid http(s) URL: ${String(url)}`,
        retryable: false,
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: httpMethod,
        headers,
        body: httpMethod === 'GET' || httpMethod === 'HEAD' ? undefined : body,
        signal: controller.signal,
      });

      if (!response.ok) {
        await response.body?.cancel();
        return {
          success: false,
          error: `HTTP ${response.status}`,
          retryable: isRetryableStatus(response.status),
        };
      }

      // The body travels in the payload to every later step and is stored
      // with the run, so an oversized one is cut to a preview rather than
      // failing the run for good on every retry.
      const read = await readBodyCapped(response);
      const stored = capForStorage(read.body);
      const truncation = stored.truncated
        ? { truncated: true, bytes: read.bytes }
        : {};

      // Namespaced under `http` so later steps can template against it
      // ({{payload.http.body.id}}) without clobbering the trigger's own
      // top-level fields. A second HTTP step replaces it - templates always
      // see the most recent response.
      return {
        success: true,
        response: {
          status: response.status,
          responseBody: stored.value,
          ...truncation,
        },
        enrichedPayload: {
          http: { status: response.status, body: stored.value, ...truncation },
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `HTTP request failed: ${errorMessage(error)}`,
        // Too large stays too large; network errors and timeouts may not.
        retryable: !(error instanceof ResponseTooLargeError),
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

function looksLikeJson(config: Record<string, unknown>) {
  const headers = config.headers;
  if (headers !== null && typeof headers === 'object') {
    for (const [name, value] of Object.entries(headers)) {
      if (
        name.toLowerCase() === 'content-type' &&
        typeof value === 'string' &&
        value.toLowerCase().includes('json')
      ) {
        return true;
      }
    }
  }
  const body = config.body;
  return typeof body === 'string' && /^\s*[[{]/.test(body);
}

function isHttpUrl(value: unknown) {
  if (typeof value !== 'string') return false;
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
