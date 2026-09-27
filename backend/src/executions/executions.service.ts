import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { ExecutionStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { MAX_EXECUTIONS_PER_USER_PER_HOUR } from '../common/limits';
import { PrismaService } from '../prisma/prisma.service';
import { getRedisConnectionOptions } from '../scheduler/redis-options';
import {
  WORKFLOW_EXECUTION_QUEUE,
  WorkflowExecutionJobData,
} from './execution-queue.module';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const DURATION_SAMPLE_SIZE = 500;
const RECENT_FAILED_JOB_SAMPLE = 1000;

@Injectable()
export class ExecutionsService {
  private readonly redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
    @InjectQueue(WORKFLOW_EXECUTION_QUEUE)
    private readonly executionQueue: Queue<WorkflowExecutionJobData>,
  ) {
    this.redis = new Redis(getRedisConnectionOptions(configService));
  }

  async list(
    userId: string,
    page = DEFAULT_PAGE,
    limit = DEFAULT_LIMIT,
    status?: string,
    workflowId?: string,
  ) {
    const safePage = Math.max(DEFAULT_PAGE, page);
    const safeLimit = Math.min(Math.max(1, limit), MAX_LIMIT);
    const skip = (safePage - 1) * safeLimit;
    const statusFilter = this.parseStatus(status);

    const where = {
      workflow: { userId },
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(workflowId ? { workflowId } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.workflowExecution.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
        include: { workflow: { select: { name: true } } },
      }),
      this.prisma.workflowExecution.count({ where }),
    ]);

    return {
      data: items.map((execution) => ({
        id: execution.id,
        workflowId: execution.workflowId,
        workflowName: execution.workflow.name,
        status: execution.status,
        startedAt: execution.startedAt,
        finishedAt: execution.finishedAt,
      })),
      meta: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  async getOne(userId: string, id: string) {
    const execution = await this.prisma.workflowExecution.findUnique({
      where: { id },
      include: {
        workflow: { select: { id: true, name: true, userId: true } },
        actionExecutions: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!execution || execution.workflow.userId !== userId) {
      throw new NotFoundException('Execution not found');
    }

    return {
      id: execution.id,
      workflowId: execution.workflowId,
      workflowName: execution.workflow.name,
      triggerId: execution.triggerId,
      status: execution.status,
      input: execution.input,
      output: execution.output,
      error: execution.error,
      startedAt: execution.startedAt,
      finishedAt: execution.finishedAt,
      createdAt: execution.createdAt,
      actionExecutions: execution.actionExecutions.map((step) => ({
        id: step.id,
        actionId: step.actionId,
        status: step.status,
        input: step.input,
        output: step.output,
        error: step.error,
        startedAt: step.startedAt,
        finishedAt: step.finishedAt,
      })),
    };
  }

  async cancel(userId: string, id: string) {
    const execution = await this.prisma.workflowExecution.findUnique({
      where: { id },
      include: { workflow: { select: { userId: true } } },
    });

    if (!execution || execution.workflow.userId !== userId) {
      throw new NotFoundException('Execution not found');
    }

    if (execution.status !== ExecutionStatus.PENDING) {
      throw new BadRequestException('Only PENDING executions can be cancelled');
    }

    await this.prisma.workflowExecution.update({
      where: { id },
      data: { status: ExecutionStatus.CANCELLED, finishedAt: new Date() },
    });

    // Best effort: the job may already have been picked up by a worker by
    // the time this runs, in which case removal is a no-op and the
    // processor will simply run to completion.
    try {
      const job = await this.executionQueue.getJob(id);
      await job?.remove();
    } catch {
      // Removal racing a worker pickup is expected — not an error.
    }

    return { cancelled: true };
  }

  async stats(userId: string) {
    const where = { workflow: { userId } };
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [total, byStatusRaw, last24hTotal, durationRows, failedJobsInDLQ] =
      await Promise.all([
        this.prisma.workflowExecution.count({ where }),
        this.prisma.workflowExecution.groupBy({
          by: ['status'],
          where,
          _count: { _all: true },
        }),
        this.prisma.workflowExecution.count({
          where: { ...where, createdAt: { gte: dayAgo } },
        }),
        this.prisma.workflowExecution.findMany({
          where: {
            ...where,
            startedAt: { not: null },
            finishedAt: { not: null },
          },
          select: { startedAt: true, finishedAt: true },
          take: DURATION_SAMPLE_SIZE,
          orderBy: { createdAt: 'desc' },
        }),
        this.countFailedJobsForUser(userId),
      ]);

    const byStatus = Object.fromEntries(
      Object.values(ExecutionStatus).map((status) => [status, 0]),
    ) as Record<ExecutionStatus, number>;

    for (const row of byStatusRaw) {
      byStatus[row.status] = row._count._all;
    }

    const durations = durationRows
      .filter((row) => row.startedAt && row.finishedAt)
      .map((row) => row.finishedAt!.getTime() - row.startedAt!.getTime());

    const avgDurationMs = durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0;

    const rateLimitUsed = await this.currentHourUsage(userId);

    return {
      total,
      byStatus,
      last24hTotal,
      avgDurationMs,
      failedJobsInDLQ,
      rateLimitRemaining: Math.max(
        0,
        MAX_EXECUTIONS_PER_USER_PER_HOUR - rateLimitUsed,
      ),
      activeWorkers: {
        configuredConcurrency: Number(process.env.WORKER_CONCURRENCY) || 5,
      },
    };
  }

  /**
   * Counts failed BullMQ jobs belonging to this user's workflows. Failed
   * jobs are sampled (most recent N) rather than scanning the whole DLQ,
   * since a Redis ZSET scan is O(n) and this endpoint is read on every
   * dashboard load — see docs for the tradeoff at scale.
   */
  private async countFailedJobsForUser(userId: string) {
    const failedJobs = await this.executionQueue.getFailed(
      0,
      RECENT_FAILED_JOB_SAMPLE,
    );

    if (failedJobs.length === 0) {
      return 0;
    }

    const executionIds = failedJobs.map((job) => job.data.executionId);
    const owned = await this.prisma.workflowExecution.findMany({
      where: { id: { in: executionIds }, workflow: { userId } },
      select: { id: true },
    });

    return owned.length;
  }

  private async currentHourUsage(userId: string) {
    const key = `rate:exec:${userId}:${Math.floor(Date.now() / 3_600_000)}`;
    const value = await this.redis.get(key);
    return value ? Number(value) : 0;
  }

  private parseStatus(status?: string): ExecutionStatus | undefined {
    if (!status) {
      return undefined;
    }

    if (!Object.values(ExecutionStatus).includes(status as ExecutionStatus)) {
      throw new BadRequestException(
        `status must be one of: ${Object.values(ExecutionStatus).join(', ')}`,
      );
    }

    return status as ExecutionStatus;
  }
}
