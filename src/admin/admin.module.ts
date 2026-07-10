import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ExecutionQueueModule } from '../executions/execution-queue.module';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';

@Module({
  imports: [ConfigModule, ExecutionQueueModule],
  controllers: [AdminController],
  providers: [AdminGuard],
})
export class AdminModule {}
