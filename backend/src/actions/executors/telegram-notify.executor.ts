import { ConfigService } from '@nestjs/config';
import {
  ActionResult,
  IActionExecutor,
} from '../interfaces/action-executor.interface';

const TELEGRAM_TIMEOUT_MS = 10_000;

interface TelegramNotifyConfig {
  chatId: string;
  message: string;
  parseMode?: 'HTML' | 'Markdown';
}

interface TelegramApiResponse {
  ok: boolean;
  result?: { message_id: number };
  description?: string;
}

export class TelegramNotifyExecutor implements IActionExecutor {
  constructor(private readonly configService: ConfigService) {}

  async execute(config: Record<string, unknown>): Promise<ActionResult> {
    const { chatId, message, parseMode } =
      config as unknown as TelegramNotifyConfig;
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');

    if (!token) {
      return { success: false, error: 'TELEGRAM_BOT_TOKEN is not configured' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS);

    try {
      const response = await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: parseMode ?? 'HTML',
          }),
          signal: controller.signal,
        },
      );

      const result = (await response.json()) as TelegramApiResponse;

      if (!response.ok || !result.ok) {
        return {
          success: false,
          error: `Telegram API error: ${result.description ?? response.status}`,
        };
      }

      return {
        success: true,
        response: { messageId: result.result?.message_id },
      };
    } catch (error) {
      return {
        success: false,
        error: `Telegram request failed: ${errorMessage(error)}`,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
