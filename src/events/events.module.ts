import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TriggeredListener } from './triggered.listener';

@Module({
  imports: [EventEmitterModule.forRoot()],
  providers: [TriggeredListener],
  exports: [EventEmitterModule],
})
export class EventsModule {}
