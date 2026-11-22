import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ExecutionQueueModule } from '../executions/execution-queue.module';
import { StrandedEventsSweeper } from './stranded-events.sweeper';
import { TriggeredListener } from './triggered.listener';

@Module({
  imports: [EventEmitterModule.forRoot(), ConfigModule, ExecutionQueueModule],
  providers: [TriggeredListener, StrandedEventsSweeper],
  exports: [EventEmitterModule],
})
export class EventsModule {}
