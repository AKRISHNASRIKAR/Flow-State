import { Logger } from '@nestjs/common';
import { Command, Start, Update } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { TelegramService } from './telegram.service';

/**
 * TelegramUpdate handles all incoming Telegram bot commands.
 *
 * Extend this class to add new commands as the bot grows —
 * each command handler should remain focused on a single responsibility.
 */
@Update()
export class TelegramUpdate {
  private readonly logger = new Logger(TelegramUpdate.name);

  constructor(private readonly telegramService: TelegramService) {}

  // ---------------------------------------------------------------------------
  // /start
  // ---------------------------------------------------------------------------

  /**
   * Triggered when a user opens the bot for the first time or types /start.
   * - Upserts the user in our telegram_users table.
   * - Replies with a welcome message that includes their Telegram ID.
   */
  @Start()
  async onStart(ctx: Context): Promise<void> {
    const from = ctx.from;
    if (!from) return;

    this.logger.log(
      `[/start] user=${from.id} username=${from.username ?? 'N/A'}`,
    );

    await this.telegramService.upsertUser({
      telegramId: from.id,
      chatId: ctx.chat!.id,
      username: from.username,
      firstName: from.first_name,
      lastName: from.last_name,
      languageCode: from.language_code,
    });

    await ctx.reply(
      `👋 Welcome to FlowState!\n\n` +
        `Your Telegram ID is:\n\n` +
        `<code>${from.id}</code>\n\n` +
        `Copy this ID into FlowState to begin receiving notifications.`,
      { parse_mode: 'HTML' },
    );
  }

  // ---------------------------------------------------------------------------
  // /id
  // ---------------------------------------------------------------------------

  /**
   * Returns the user's Telegram ID for easy copying.
   * Useful for users who have already started the bot but lost their ID.
   */
  @Command('id')
  async onId(ctx: Context): Promise<void> {
    const from = ctx.from;
    if (!from) return;

    this.logger.log(
      `[/id] user=${from.id} username=${from.username ?? 'N/A'}`,
    );

    await ctx.reply(
      `🪪 Your Telegram ID is:\n\n<code>${from.id}</code>`,
      { parse_mode: 'HTML' },
    );
  }
}
