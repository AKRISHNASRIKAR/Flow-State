import { ActionType } from '@flowstate/api-types';
import { z } from 'zod';

export interface ActionMeta {
  type: ActionType;
  label: string;
  icon: string;
  description: string;
  /** One-line node summary rendered on the canvas. */
  summarize: (config: Record<string, unknown>) => string;
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export const ACTION_META: Record<ActionType, ActionMeta> = {
  LOG_MESSAGE: {
    type: ActionType.LOG_MESSAGE,
    label: 'Log a message',
    icon: '📝',
    description: 'Write a note to the run’s log — useful while testing.',
    summarize: (c) => str(c.message) || 'No message set',
  },
  DELAY: {
    type: ActionType.DELAY,
    label: 'Wait',
    icon: '⏱️',
    description: 'Pause for a number of seconds before the next step.',
    summarize: (c) => (typeof c.seconds === 'number' ? `Wait ${c.seconds}s` : 'No delay set'),
  },
  HTTP_REQUEST: {
    type: ActionType.HTTP_REQUEST,
    label: 'Web request',
    icon: '🌐',
    description: 'Call a URL — an API or another app’s webhook. Later steps can use its reply.',
    summarize: (c) => `${str(c.method) || 'GET'} ${str(c.url) || '(no URL)'}`,
  },
  SEND_EMAIL: {
    type: ActionType.SEND_EMAIL,
    label: 'Send an email',
    icon: '✉️',
    description: 'Send an email through Resend.',
    summarize: (c) => (str(c.to) ? `To ${str(c.to)}` : 'No recipient set'),
  },
  TELEGRAM_NOTIFY: {
    type: ActionType.TELEGRAM_NOTIFY,
    label: 'Telegram message',
    icon: '💬',
    description: 'Send a message through the FlowState Telegram bot.',
    summarize: (c) => (str(c.chatId) ? `Chat ${str(c.chatId)}` : 'No chat ID set'),
  },
};

export const ACTION_TYPES = Object.values(ACTION_META);

// ---------------------------------------------------------------------------
// Per-type config schemas. String fields accept {{payload.x}} templates, so
// URL/email fields deliberately use plain min-length checks, not format ones.
// ---------------------------------------------------------------------------

const headersArray = z.array(z.object({ key: z.string(), value: z.string() }));

export const actionSchemas = {
  LOG_MESSAGE: z.object({
    message: z.string().min(1, 'Message is required'),
    level: z.enum(['info', 'warn', 'error']).optional(),
  }),
  DELAY: z.object({
    seconds: z.coerce.number({ invalid_type_error: 'Enter a number of seconds' }).positive('Must be > 0'),
  }),
  HTTP_REQUEST: z.object({
    url: z.string().min(1, 'URL is required'),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
    headers: headersArray,
    body: z.string().optional(),
  }),
  SEND_EMAIL: z.object({
    to: z.string().min(1, 'Recipient is required'),
    subject: z.string().min(1, 'Subject is required'),
    body: z.string().min(1, 'Body is required'),
    fromName: z.string().optional(),
  }),
  TELEGRAM_NOTIFY: z.object({
    chatId: z.string().min(1, 'Chat ID is required'),
    message: z.string().min(1, 'Message is required'),
    parseMode: z.enum(['', 'HTML', 'Markdown']).optional(),
  }),
} satisfies Record<ActionType, z.ZodTypeAny>;

export function headersToRows(headers: unknown): { key: string; value: string }[] {
  if (headers && typeof headers === 'object' && !Array.isArray(headers)) {
    return Object.entries(headers as Record<string, unknown>).map(([key, value]) => ({
      key,
      value: String(value),
    }));
  }
  return [];
}

export function rowsToHeaders(rows: { key: string; value: string }[]): Record<string, string> | undefined {
  const entries = rows.filter((r) => r.key.trim() !== '').map((r) => [r.key.trim(), r.value] as const);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

/** Convert form values to the API's configuration object for a given type. */
export function formToConfiguration(type: ActionType, values: Record<string, unknown>): Record<string, unknown> {
  switch (type) {
    case 'LOG_MESSAGE':
      return { message: values.message, ...(values.level ? { level: values.level } : {}) };
    case 'DELAY':
      return { seconds: Number(values.seconds) };
    case 'HTTP_REQUEST': {
      const headers = rowsToHeaders((values.headers as { key: string; value: string }[]) ?? []);
      return {
        url: values.url,
        method: values.method,
        ...(headers ? { headers } : {}),
        ...(typeof values.body === 'string' && values.body.trim() !== '' ? { body: values.body } : {}),
      };
    }
    case 'SEND_EMAIL':
      return {
        to: values.to,
        subject: values.subject,
        body: values.body,
        ...(typeof values.fromName === 'string' && values.fromName.trim() !== ''
          ? { fromName: values.fromName }
          : {}),
      };
    case 'TELEGRAM_NOTIFY':
      return {
        chatId: values.chatId,
        message: values.message,
        ...(values.parseMode ? { parseMode: values.parseMode } : {}),
      };
  }
}

/** Convert an existing configuration into form default values for a given type. */
export function configurationToForm(type: ActionType, config: Record<string, unknown>): Record<string, unknown> {
  switch (type) {
    case 'LOG_MESSAGE':
      return { message: str(config.message), level: config.level ?? undefined };
    case 'DELAY':
      return { seconds: typeof config.seconds === 'number' ? config.seconds : 5 };
    case 'HTTP_REQUEST':
      return {
        url: str(config.url),
        method: typeof config.method === 'string' ? config.method.toUpperCase() : 'GET',
        headers: headersToRows(config.headers),
        body: str(config.body),
      };
    case 'SEND_EMAIL':
      return {
        to: str(config.to),
        subject: str(config.subject),
        body: str(config.body),
        fromName: str(config.fromName),
      };
    case 'TELEGRAM_NOTIFY':
      return {
        chatId: str(config.chatId),
        message: str(config.message),
        parseMode: (config.parseMode as string | undefined) ?? '',
      };
  }
}
