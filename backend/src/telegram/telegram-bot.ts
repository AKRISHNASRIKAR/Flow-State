import { timingSafeEqual } from 'crypto';

/**
 * The FlowState Telegram bot, in webhook mode.
 *
 * Telegram POSTs each update to our webhook URL instead of us long-polling
 * for them. That needs no always-running process — the prerequisite for
 * Cloudflare Workers — and a sleeping Render instance simply wakes on the
 * request. Registration is a one-off `setWebhook` call (see README).
 *
 * Framework-free on purpose: imported by both the NestJS backend and worker/.
 */

const TELEGRAM_TIMEOUT_MS = 10_000;

/** The subset of Telegram's Update object the bot reads. */
interface TelegramUpdate {
  message?: {
    text?: string;
    chat: { id: number };
    from?: {
      id: number;
      username?: string;
      first_name?: string;
      last_name?: string;
      language_code?: string;
    };
  };
}

export interface TelegramUserRecord {
  telegramId: number;
  chatId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  languageCode?: string;
}

export interface TelegramBotDeps {
  botToken: string;
  saveUser: (user: TelegramUserRecord) => Promise<void>;
}

/**
 * Telegram echoes the `secret_token` given to setWebhook in this header on
 * every delivery. Without a configured secret the webhook is refused outright
 * — an open endpoint would let anyone make the bot write to our database.
 */
export const TELEGRAM_SECRET_HEADER = 'x-telegram-bot-api-secret-token';

export function isValidTelegramSecret(
  received: string | undefined,
  expected: string | undefined,
): boolean {
  if (!expected || !received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function isUpdate(value: unknown): value is TelegramUpdate {
  return typeof value === 'object' && value !== null;
}

/** "/start", "/start@FlowStateBot payload" → "start". */
function commandOf(text: string | undefined): string | undefined {
  const match = text?.match(/^\/([a-z]+)(?:@\w+)?(?:\s|$)/i);
  return match?.[1].toLowerCase();
}

export async function handleTelegramUpdate(
  update: unknown,
  deps: TelegramBotDeps,
): Promise<void> {
  if (!isUpdate(update) || !update.message?.from) return;
  const { message } = update;
  const from = message.from!;

  switch (commandOf(message.text)) {
    case 'start':
      await deps.saveUser({
        telegramId: from.id,
        chatId: message.chat.id,
        username: from.username,
        firstName: from.first_name,
        lastName: from.last_name,
        languageCode: from.language_code,
      });
      await sendMessage(
        deps.botToken,
        message.chat.id,
        `👋 Welcome to FlowState!\n\nYour Telegram ID is:\n\n<code>${from.id}</code>\n\n` +
          `Copy this ID into FlowState to begin receiving notifications.`,
      );
      return;
    case 'id':
      await sendMessage(
        deps.botToken,
        message.chat.id,
        `🪪 Your Telegram ID is:\n\n<code>${from.id}</code>`,
      );
      return;
    default:
      // Anything else is ignored; Telegram only needs a 200 to stop retrying.
      return;
  }
}

async function sendMessage(
  botToken: string,
  chatId: number,
  text: string,
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      // Surfaced to the caller's logs; Telegram still gets its 200 so it
      // doesn't redeliver an update we've already acted on.
      throw new Error(
        `Telegram sendMessage failed with HTTP ${response.status}`,
      );
    }
  } finally {
    clearTimeout(timeout);
  }
}
