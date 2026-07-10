import {
  ActionResult,
  IActionExecutor,
} from '../interfaces/action-executor.interface';

const HTTP_TIMEOUT_MS = 10_000;

interface HttpRequestConfig {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export class HttpRequestExecutor implements IActionExecutor {
  async execute(config: Record<string, unknown>): Promise<ActionResult> {
    const { url, method, headers, body } =
      config as unknown as HttpRequestConfig;
    const httpMethod = (method ?? 'GET').toUpperCase();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: httpMethod,
        headers,
        body: httpMethod === 'GET' || httpMethod === 'HEAD' ? undefined : body,
        signal: controller.signal,
      });

      const contentType = response.headers.get('content-type') ?? '';
      const responseBody: unknown = contentType.includes('application/json')
        ? await response.json()
        : await response.text();

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}` };
      }

      return {
        success: true,
        response: { status: response.status, responseBody },
      };
    } catch (error) {
      return {
        success: false,
        error: `HTTP request failed: ${errorMessage(error)}`,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
