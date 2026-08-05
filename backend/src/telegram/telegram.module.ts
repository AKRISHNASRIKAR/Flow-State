import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TelegrafModule } from 'nestjs-telegraf';
import { PrismaModule } from '../prisma/prisma.module';
import { TelegramService } from './telegram.service';
import { TelegramUpdate } from './telegram.update';

@Module({
  imports: [
    /**
     * TelegrafModule.forRootAsync reads the bot token from the global
     * ConfigModule, which loads it from .env.  Long polling is used here
     * so the bot works locally without a public webhook URL.
     */
    TelegrafModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const token = config.get<string>('TELEGRAM_BOT_TOKEN');
        const isValid = Boolean(token && !token.includes('dummy') && !token.includes('123456789'));
        return {
          token: token || '000000000:AAA_dummy_telegram_token_for_startup',
          launch: isValid ? {} : false,
        };
      },
    }),
    PrismaModule,
  ],
  providers: [TelegramService, TelegramUpdate],
  exports: [TelegramService],
})
export class TelegramModule {}
