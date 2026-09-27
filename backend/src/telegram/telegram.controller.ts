import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import {
  TELEGRAM_SECRET_HEADER,
  TelegramUserRecord,
  handleTelegramUpdate,
  isValidTelegramSecret,
} from './telegram-bot';

@Controller('telegram')
export class TelegramController {
  private readonly logger = new Logger(TelegramController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  // Public because Telegram, not a signed-in user, calls it. The secret
  // header set via setWebhook is what authenticates the request.
  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async webhook(
    @Headers(TELEGRAM_SECRET_HEADER) secret: string | undefined,
    @Body() update: unknown,
  ) {
    const botToken = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    if (
      !botToken ||
      !isValidTelegramSecret(
        secret,
        this.config.get<string>('TELEGRAM_WEBHOOK_SECRET'),
      )
    ) {
      throw new UnauthorizedException('Invalid Telegram webhook secret');
    }

    try {
      await handleTelegramUpdate(update, {
        botToken,
        saveUser: (user) => this.saveUser(user),
      });
    } catch (error) {
      // Still 200: a failed reply shouldn't make Telegram redeliver the same
      // update over and over.
      this.logger.error(
        `Telegram update failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return { ok: true };
  }

  private async saveUser(user: TelegramUserRecord) {
    const fields = {
      chatId: BigInt(user.chatId),
      username: user.username ?? null,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      languageCode: user.languageCode ?? null,
    };
    await this.prisma.telegramUser.upsert({
      where: { telegramId: BigInt(user.telegramId) },
      // Re-activates a user who had previously blocked the bot.
      update: { ...fields, isActive: true },
      create: { telegramId: BigInt(user.telegramId), ...fields },
    });
  }
}
