import { Module } from '@nestjs/common';
import { ActionExecutorModule } from '../actions/action-executor.module';
import { SharedModule } from '../shared/shared.module';
import { ExecutionQueueModule } from './execution-queue.module';
import { ExecutionsController } from './executions.controller';
import { ExecutionsService } from './executions.service';
import { WorkflowProcessor } from './workflow.processor';

@Module({
  imports: [ExecutionQueueModule, ActionExecutorModule, SharedModule],
  controllers: [ExecutionsController],
  providers: [ExecutionsService, WorkflowProcessor],
  exports: [ExecutionQueueModule],
})
export class ExecutionsModule {}
