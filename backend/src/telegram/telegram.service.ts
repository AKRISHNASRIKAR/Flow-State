import { Injectable, Logger } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(
    @InjectBot() private readonly bot: Telegraf,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Send a plain-text message to a Telegram chat.
   * If the bot has been blocked by the user, mark them inactive in the DB.
   */
  async sendMessage(chatId: string | number, text: string): Promise<void> {
    try {
      await this.bot.telegram.sendMessage(chatId, text);
      this.logger.log(`Message sent to chat ${chatId}`);
    } catch (error) {
      await this.handleSendError(chatId, error);
    }
  }

  /**
   * Send a Markdown-formatted message.
   */
  async sendMarkdown(chatId: string | number, text: string): Promise<void> {
    try {
      await this.bot.telegram.sendMessage(chatId, text, {
        parse_mode: 'MarkdownV2',
      });
      this.logger.log(`Markdown message sent to chat ${chatId}`);
    } catch (error) {
      await this.handleSendError(chatId, error);
    }
  }

  /**
   * Send a photo by URL.
   */
  async sendPhoto(chatId: string | number, photoUrl: string): Promise<void> {
    try {
      await this.bot.telegram.sendPhoto(chatId, photoUrl);
      this.logger.log(`Photo sent to chat ${chatId}`);
    } catch (error) {
      await this.handleSendError(chatId, error);
    }
  }

  /**
   * Upserts a Telegram user after a /start or /id command.
   * Returns the upserted record.
   */
  async upsertUser(data: {
    telegramId: number;
    chatId: number;
    username?: string;
    firstName?: string;
    lastName?: string;
    languageCode?: string;
  }) {
    return this.prisma.telegramUser.upsert({
      where: { telegramId: BigInt(data.telegramId) },
      update: {
        chatId: BigInt(data.chatId),
        username: data.username ?? null,
        firstName: data.firstName ?? null,
        lastName: data.lastName ?? null,
        languageCode: data.languageCode ?? null,
        isActive: true, // re-activate if they had previously blocked the bot
      },
      create: {
        telegramId: BigInt(data.telegramId),
        chatId: BigInt(data.chatId),
        username: data.username ?? null,
        firstName: data.firstName ?? null,
        lastName: data.lastName ?? null,
        languageCode: data.languageCode ?? null,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Handles errors thrown while attempting to send a Telegram message.
   * If the error indicates the bot was blocked, mark the user inactive.
   */
  private async handleSendError(
    chatId: string | number,
    error: unknown,
  ): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(`Failed to send message to chat ${chatId}: ${message}`);

    if (this.isBotBlocked(message)) {
      this.logger.warn(
        `Bot blocked by user with chat ${chatId} — marking inactive`,
      );
      await this.markUserInactive(chatId);
    }
  }

  /** Returns true when the Telegram error indicates the bot has been blocked. */
  private isBotBlocked(errorMessage: string): boolean {
    const blockedPhrases = [
      'bot was blocked by the user',
      'user is deactivated',
      'chat not found',
      'ETELEGRAM: 403',
    ];
    return blockedPhrases.some((phrase) =>
      errorMessage.toLowerCase().includes(phrase.toLowerCase()),
    );
  }

  /** Marks the TelegramUser record as inactive by chatId. */
  private async markUserInactive(chatId: string | number): Promise<void> {
    try {
      await this.prisma.telegramUser.update({
        where: { chatId: BigInt(chatId) },
        data: { isActive: false },
      });
    } catch (err) {
      // User may not exist yet in our DB — silently ignore
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Could not mark user ${chatId} inactive: ${msg}`);
    }
  }
}
