import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ExecutionQueueModule } from '../executions/execution-queue.module';
import { TriggeredListener } from './triggered.listener';

@Module({
  imports: [EventEmitterModule.forRoot(), ConfigModule, ExecutionQueueModule],
  providers: [TriggeredListener],
  exports: [EventEmitterModule],
})
export class EventsModule {}
