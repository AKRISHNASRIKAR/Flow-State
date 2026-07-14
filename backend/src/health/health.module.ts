import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ExecutionQueueModule } from '../executions/execution-queue.module';
import { HealthController } from './health.controller';

@Module({
  imports: [ConfigModule, ExecutionQueueModule],
  controllers: [HealthController],
})
export class HealthModule {}
