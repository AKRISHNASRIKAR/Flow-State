import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TelegramController } from './telegram.controller';

/**
 * The bot runs in webhook mode (POST /telegram/webhook) — no long-polling
 * loop, so no always-on process and no bot token needed at boot. See
 * telegram-bot.ts for why.
 */
@Module({
  imports: [PrismaModule],
  controllers: [TelegramController],
})
export class TelegramModule {}
