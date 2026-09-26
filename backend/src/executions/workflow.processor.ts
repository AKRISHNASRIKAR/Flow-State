import { Injectable, Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { AuditAction, ExecutionStatus, Prisma } from '@prisma/client';
import { Job } from 'bullmq';
import { ActionExecutorService } from '../actions/action-executor.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../shared/audit-log.service';
import {
  WORKFLOW_EXECUTION_QUEUE,
  WorkflowExecutionJobData,
} from './execution-queue.module';

const WORKER_CONCURRENCY = Number(process.env.WORKER_CONCURRENCY) || 5;

/**
 * Runs one WorkflowExecution end to end: fetch the action chain, execute
 * each step in order via ActionExecutorService, thread the payload through,
 * and record every step as an ActionExecution row. Any number of instances
 * of this processor can run against the same 'workflow-execution' queue —
 * BullMQ guarantees a job is only ever locked by one worker at a time, so
 * horizontal scaling is just "start another process".
 */
@Injectable()
@Processor(WORKFLOW_EXECUTION_QUEUE, { concurrency: WORKER_CONCURRENCY })
export class WorkflowProcessor extends WorkerHost {
  private readonly logger = new Logger(WorkflowProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly actionExecutor: ActionExecutorService,
    private readonly auditLog: AuditLogService,
  ) {
    super();
  }

  async process(job: Job<WorkflowExecutionJobData>): Promise<void> {
    const execution = await this.prisma.workflowExecution.findUnique({
      where: { id: job.data.executionId },
      include: { workflow: true },
    });

    if (!execution) {
      throw new Error(`Execution not found: ${job.data.executionId}`);
    }

    const actions = await this.prisma.action.findMany({
      where: { workflowId: execution.workflowId },
      orderBy: { position: 'asc' },
    });

    await this.prisma.workflowExecution.update({
      where: { id: execution.id },
      data: { status: ExecutionStatus.RUNNING, startedAt: new Date() },
    });

    // A retry resumes after the steps that already succeeded instead of
    // re-running from action #1, so their side effects (an email sent, a row
    // appended) aren't repeated. `output` is checkpointed in the same
    // transaction that marks each step SUCCEEDED, so it always holds exactly
    // the payload the next unfinished step should see.
    const succeededActionIds = await this.findSucceededActionIds(execution.id);
    let currentPayload = ((succeededActionIds.size > 0
      ? (execution.output ?? execution.input)
      : execution.input) ?? {}) as Record<string, unknown>;
    let failure: { actionId: string; error: string } | undefined;

    for (const action of actions) {
      if (succeededActionIds.has(action.id)) {
        continue;
      }

      const actionExecution = await this.prisma.actionExecution.create({
        data: {
          workflowExecutionId: execution.id,
          actionId: action.id,
          status: ExecutionStatus.RUNNING,
          input: currentPayload as Prisma.InputJsonValue,
          startedAt: new Date(),
        },
      });

      if (action.type === 'DELAY') {
        // Simplification: block inline instead of re-enqueuing with BullMQ's
        // `delay` option. Acceptable for short delays in a portfolio build;
        // production would split the remaining actions into a new delayed
        // job so this worker slot isn't held hostage by a sleeping timer.
        const seconds = Number(
          (action.config as Record<string, unknown> | null)?.seconds ?? 0,
        );
        await sleep(seconds * 1000);
      }

      const result = await this.actionExecutor.execute(
        action.type,
        (action.config ?? {}) as Record<string, unknown>,
        currentPayload,
        {
          userId: execution.workflow.userId,
          workflowId: execution.workflowId,
          executionId: execution.id,
        },
      );

      if (!result.success) {
        await this.prisma.actionExecution.update({
          where: { id: actionExecution.id },
          data: {
            status: ExecutionStatus.FAILED,
            error: result.error,
            finishedAt: new Date(),
          },
        });
        failure = {
          actionId: action.id,
          error: result.error ?? 'Unknown action failure',
        };
        break;
      }

      if (result.enrichedPayload) {
        currentPayload = { ...currentPayload, ...result.enrichedPayload };
      }

      await this.prisma.$transaction([
        this.prisma.actionExecution.update({
          where: { id: actionExecution.id },
          data: {
            status: ExecutionStatus.SUCCEEDED,
            output: (result.response ?? {}) as Prisma.InputJsonValue,
            finishedAt: new Date(),
          },
        }),
        this.prisma.workflowExecution.update({
          where: { id: execution.id },
          data: { output: currentPayload as Prisma.InputJsonValue },
        }),
      ]);
    }

    if (!failure) {
      await this.prisma.workflowExecution.update({
        where: { id: execution.id },
        data: {
          status: ExecutionStatus.SUCCEEDED,
          output: currentPayload as Prisma.InputJsonValue,
          finishedAt: new Date(),
        },
      });

      this.auditLog.log(execution.workflow.userId, AuditAction.WORKFLOW_RUN, {
        entityType: 'workflow_executions',
        entityId: execution.id,
        event: 'workflow.executed',
        workflowId: execution.workflowId,
        status: ExecutionStatus.SUCCEEDED,
      });

      return;
    }

    await this.prisma.workflowExecution.update({
      where: { id: execution.id },
      data: {
        status: ExecutionStatus.FAILED,
        error: failure.error,
        finishedAt: new Date(),
      },
    });

    this.auditLog.log(execution.workflow.userId, AuditAction.WORKFLOW_RUN, {
      entityType: 'workflow_executions',
      entityId: execution.id,
      event: 'workflow.executed',
      workflowId: execution.workflowId,
      status: ExecutionStatus.FAILED,
      failedActionId: failure.actionId,
    });

    // Throwing signals BullMQ to retry per the job's attempts/backoff opts.
    // The @OnWorkerEvent('failed') hook below only fires the DLQ bookkeeping
    // once every retry attempt has been exhausted.
    throw new Error(failure.error);
  }

  private async findSucceededActionIds(
    executionId: string,
  ): Promise<Set<string>> {
    const rows = await this.prisma.actionExecution.findMany({
      where: {
        workflowExecutionId: executionId,
        status: ExecutionStatus.SUCCEEDED,
      },
      select: { actionId: true },
    });
    return new Set(rows.map((row) => row.actionId));
  }

  /**
   * Dead-letter bookkeeping. BullMQ already keeps the failed job in Redis
   * (removeOnFail: false) — this hook makes sure the WorkflowExecution row
   * in Postgres reflects the terminal state too, and writes an audit trail
   * entry marking the execution as dead-lettered so it's discoverable
   * without querying Redis directly.
   */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<WorkflowExecutionJobData> | undefined, error: Error) {
    if (!job) {
      return;
    }

    const attemptsMade = job.attemptsMade;
    const maxAttempts = job.opts.attempts ?? 1;

    if (attemptsMade < maxAttempts) {
      return; // more retries scheduled — not dead yet
    }

    const execution = await this.prisma.workflowExecution.findUnique({
      where: { id: job.data.executionId },
      select: {
        id: true,
        status: true,
        workflow: { select: { userId: true } },
      },
    });

    if (!execution) {
      return;
    }

    if (execution.status !== ExecutionStatus.FAILED) {
      await this.prisma.workflowExecution.update({
        where: { id: execution.id },
        data: {
          status: ExecutionStatus.FAILED,
          error: error.message,
          finishedAt: new Date(),
        },
      });
    }

    this.logger.error(
      `Execution ${execution.id} exhausted all retries and was dead-lettered: ${error.message}`,
    );

    this.auditLog.log(execution.workflow.userId, AuditAction.WORKFLOW_RUN, {
      entityType: 'workflow_executions',
      entityId: execution.id,
      event: 'workflow.execution.dead_lettered',
      attemptsMade,
      error: error.message,
    });
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
