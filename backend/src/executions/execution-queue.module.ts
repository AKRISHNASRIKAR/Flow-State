import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

export const WORKFLOW_EXECUTION_QUEUE = 'workflow-execution';

export interface WorkflowExecutionJobData {
  executionId: string;
}

/**
 * Wraps BullModule.registerQueue() so both the trigger listener (producer)
 * and the executions module (consumer + admin/introspection) share the same
 * Queue instance instead of each opening a separate Redis connection for
 * the same queue name.
 */
@Module({
  imports: [BullModule.registerQueue({ name: WORKFLOW_EXECUTION_QUEUE })],
  exports: [BullModule],
})
export class ExecutionQueueModule {}
