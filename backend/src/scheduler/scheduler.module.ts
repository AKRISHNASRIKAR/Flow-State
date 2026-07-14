import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventsModule } from '../events/events.module';
import { getRedisConnectionOptions } from './redis-options';
import { PollingWorker } from './polling.worker';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [
    ConfigModule,
    EventsModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: getRedisConnectionOptions(configService),
      }),
    }),
    BullModule.registerQueue({
      name: 'polling',
    }),
  ],
  providers: [SchedulerService, PollingWorker],
  exports: [SchedulerService],
})
export class SchedulerModule {}
