import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { OnEvent } from '@nestjs/event-emitter';
import { ExecutionStatus, WorkflowStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { getRedisConnectionOptions } from '../scheduler/redis-options';
import {
  WORKFLOW_EXECUTION_QUEUE,
  WorkflowExecutionJobData,
} from '../executions/execution-queue.module';
import { WorkflowTriggeredEvent } from './workflow-triggered.event';

const MAX_CONCURRENT_EXECUTIONS_PER_WORKFLOW = 3;
const MAX_EXECUTIONS_PER_USER_PER_HOUR = 100;

/**
 * Bridges the fire-and-forget event bus to the durable execution queue.
 *
 * Every "workflow.triggered" event (webhook, manual fire, or poll) lands
 * here. This handler creates the WorkflowExecution row (the durable record
 * of "this run happened") and enqueues a BullMQ job that references it by
 * id. The actual action chain runs in WorkflowProcessor, decoupled from
 * this handler by the queue — if the process crashes after this method
 * returns, the job survives in Redis and a worker will still pick it up.
 */
@Injectable()
export class TriggeredListener {
  private readonly logger = new Logger(TriggeredListener.name);
  private readonly redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
    @InjectQueue(WORKFLOW_EXECUTION_QUEUE)
    private readonly executionQueue: Queue<WorkflowExecutionJobData>,
  ) {
    this.redis = new Redis(getRedisConnectionOptions(configService));
  }

  @OnEvent('workflow.triggered')
  async handleTriggered(event: WorkflowTriggeredEvent) {
    this.logger.log(
      `workflow.triggered workflowId=${event.workflowId} source=${event.source}`,
    );

    const workflow = await this.prisma.workflow.findUnique({
      where: { id: event.workflowId },
    });

    if (!workflow || workflow.status !== WorkflowStatus.ACTIVE) {
      this.logger.warn(
        `Ignoring trigger for missing/inactive workflow ${event.workflowId}`,
      );
      await this.markWebhookEvent(event.webhookEventId, 'SKIPPED');
      return;
    }

    // Concurrency ceiling: a runaway or misconfigured workflow (e.g. a
    // webhook sender retrying in a tight loop) should not be able to queue
    // unbounded work for itself and starve every other workflow's jobs.
    const inFlight = await this.prisma.workflowExecution.count({
      where: {
        workflowId: workflow.id,
        status: { in: [ExecutionStatus.PENDING, ExecutionStatus.RUNNING] },
      },
    });

    if (inFlight >= MAX_CONCURRENT_EXECUTIONS_PER_WORKFLOW) {
      this.logger.warn(
        `Workflow ${workflow.id} at concurrency limit (${inFlight}/${MAX_CONCURRENT_EXECUTIONS_PER_WORKFLOW}) — skipping`,
      );
      await this.markWebhookEvent(
        event.webhookEventId,
        'SKIPPED_CONCURRENCY_LIMIT',
      );
      return;
    }

    // Per-user rate limit: a fixed hourly window keyed by userId + hour
    // bucket. INCR is atomic in Redis, so concurrent triggers can't race
    // past the limit; EXPIRE is only set on the first increment in a
    // bucket so the key self-cleans instead of growing forever.
    const rateLimitKey = this.rateLimitKey(workflow.userId);
    const count = await this.redis.incr(rateLimitKey);
    if (count === 1) {
      await this.redis.expire(rateLimitKey, 3600);
    }

    if (count > MAX_EXECUTIONS_PER_USER_PER_HOUR) {
      this.logger.warn(`Rate limit exceeded for user ${workflow.userId}`);
      await this.markWebhookEvent(event.webhookEventId, 'SKIPPED_RATE_LIMIT');
      return;
    }

    const trigger = await this.prisma.trigger.findUnique({
      where: { workflowId: workflow.id },
      select: { id: true },
    });

    const execution = await this.prisma.workflowExecution.create({
      data: {
        workflowId: workflow.id,
        triggerId: trigger?.id,
        status: ExecutionStatus.PENDING,
        input: event.executionPayload ?? {},
      },
    });

    await this.executionQueue.add(
      'execute',
      { executionId: execution.id },
      {
        jobId: execution.id,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: false, // keep failed jobs around for the DLQ endpoints
      },
    );

    await this.markWebhookEvent(event.webhookEventId, 'PROCESSED');
  }

  private rateLimitKey(userId: string) {
    return `rate:exec:${userId}:${Math.floor(Date.now() / 3_600_000)}`;
  }

  private async markWebhookEvent(
    webhookEventId: string | undefined,
    status: string,
  ) {
    if (!webhookEventId) {
      return;
    }

    await this.prisma.webhookEvent
      .update({
        where: { id: webhookEventId },
        data: { status },
      })
      .catch((err: unknown) => {
        this.logger.error(
          `Failed to mark webhookEvent ${webhookEventId} as ${status}`,
          err,
        );
      });
  }
}
