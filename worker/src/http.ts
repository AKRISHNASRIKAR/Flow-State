import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';

/**
 * Errors in the exact shape NestJS produced (`{ statusCode, message, error }`,
 * `message` an array for validation failures), so the dashboard's ApiError
 * handling — and every toast it drives — works unchanged against either API.
 */

const STATUS_TEXT: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

export class HttpError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly messages: string | string[],
    /** Replaces the standard body — for the few responses Nest shaped by hand. */
    readonly customBody?: Record<string, unknown>,
  ) {
    super(Array.isArray(messages) ? messages.join('; ') : messages);
  }

  body(): Record<string, unknown> {
    return this.customBody ?? errorBody(this.status, this.messages);
  }
}

export function errorBody(status: number, message: string | string[]) {
  return { statusCode: status, message, error: STATUS_TEXT[status] ?? 'Error' };
}

export const badRequest = (message: string | string[]) => new HttpError(400, message);
export const unauthorized = (message: string) => new HttpError(401, message);
export const forbidden = (message: string) => new HttpError(403, message);
export const notFound = (message: string) => new HttpError(404, message);
export const unavailable = (message: string) => new HttpError(503, message);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string | undefined): value is string => !!value && UUID_PATTERN.test(value);

/**
 * Parses and validates a JSON body. Schemas are `.strict()`, mirroring the
 * backend's `forbidNonWhitelisted`: an unknown field is a 400, not silently
 * dropped.
 */
export async function parseBody<T>(c: Context, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    const text = await c.req.text();
    raw = text.trim() === '' ? {} : (JSON.parse(text) as unknown);
  } catch {
    throw badRequest('Invalid JSON body');
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw badRequest(result.error.issues.map(describeIssue));
  }
  return result.data;
}

function describeIssue(issue: z.ZodIssue): string {
  if (issue.code === 'unrecognized_keys') {
    return issue.keys.map((key) => `property ${key} should not exist`).join('; ');
  }
  const field = issue.path.join('.');
  return field ? `${field}: ${issue.message}` : issue.message;
}

/**
 * Matches the backend exactly: its global `transform` turns the string into
 * a number first, `DefaultValuePipe` treats NaN ("abc") as missing, and
 * `ParseIntPipe` then rejects a non-integer ("2.5").
 */
export function intQuery(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const number = Number(value);
  if (Number.isNaN(number)) return fallback;
  if (!Number.isInteger(number)) throw badRequest('Validation failed (numeric string is expected)');
  return number;
}

// Mirrors of the backend DTOs (class-validator rules → zod).

const configuration = z.record(z.unknown());

export const schemas = {
  createWorkflow: z
    .object({
      name: z.string().min(1).max(120),
      description: z.string().max(1000).optional(),
      enabled: z.boolean().optional(),
    })
    .strict(),
  updateWorkflow: z
    .object({
      name: z.string().min(1).max(120).optional(),
      description: z.string().max(1000).optional(),
      enabled: z.boolean().optional(),
    })
    .strict(),
  createAction: z
    .object({
      type: z.string().min(1).max(120),
      configuration: configuration.optional(),
      order: z.number().int().min(0).optional(),
    })
    .strict(),
  updateAction: z
    .object({
      type: z.string().min(1).max(120).optional(),
      configuration: configuration.optional(),
      order: z.number().int().min(0).optional(),
    })
    .strict(),
  reorderActions: z.object({ orderedIds: z.array(z.string().uuid()).nonempty() }).strict(),
  upsertTrigger: z
    .object({
      type: z.enum(['WEBHOOK', 'MANUAL', 'SCHEDULED'], {
        errorMap: () => ({ message: 'type must be one of: WEBHOOK, MANUAL, SCHEDULED' }),
      }),
      configuration: configuration.optional(),
    })
    .strict(),
  // No DTO on the backend for manual fire — any object is accepted.
  manualFire: z.object({ payload: configuration.optional() }).passthrough(),
  refreshToken: z.object({ refreshToken: z.string() }).strict(),
  googleExchange: z.object({ code: z.string().min(16).max(128), nonce: z.string().min(16).max(128) }).strict(),
};
