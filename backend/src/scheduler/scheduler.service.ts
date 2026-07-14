import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TriggerType, WorkflowStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePollingConfig } from './polling-config';

export interface PollingJobData {
  triggerId: string;
}

@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('polling')
    private readonly pollingQueue: Queue<PollingJobData>,
  ) {}

  async onModuleInit() {
    const triggers = await this.prisma.trigger.findMany({
      where: {
        type: TriggerType.SCHEDULED,
        enabled: true,
        workflow: { status: WorkflowStatus.ACTIVE },
      },
      select: { id: true },
    });

    await Promise.all(
      triggers.map((trigger) => this.registerPoller(trigger.id)),
    );
  }

  async registerPoller(triggerId: string): Promise<void> {
    const trigger = await this.prisma.trigger.findUnique({
      where: { id: triggerId },
      include: { workflow: true },
    });

    if (
      !trigger ||
      trigger.type !== TriggerType.SCHEDULED ||
      !trigger.enabled ||
      trigger.workflow.status !== WorkflowStatus.ACTIVE
    ) {
      await this.unregisterPoller(triggerId);
      return;
    }

    const config = normalizePollingConfig(trigger.config);
    const jobId = this.pollJobId(triggerId);

    await this.unregisterPoller(triggerId);
    await this.pollingQueue.add(
      'poll',
      { triggerId },
      {
        repeat: { every: config.interval * 1000 },
        jobId,
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );

    this.logger.log(`Registered poller ${triggerId} every ${config.interval}s`);
  }

  async unregisterPoller(triggerId: string): Promise<void> {
    const jobId = this.pollJobId(triggerId);
    const repeatableJobs = await this.pollingQueue.getRepeatableJobs();
    const matchingJobs = repeatableJobs.filter(
      (job) => job.name === 'poll' && job.id === jobId,
    );

    await Promise.all(
      matchingJobs.map((job) =>
        this.pollingQueue.removeRepeatableByKey(job.key),
      ),
    );
  }

  async registerWorkflowPoller(workflowId: string): Promise<void> {
    const trigger = await this.prisma.trigger.findUnique({
      where: { workflowId },
      select: { id: true, type: true },
    });

    if (trigger?.type === TriggerType.SCHEDULED) {
      await this.registerPoller(trigger.id);
    }
  }

  async unregisterWorkflowPoller(workflowId: string): Promise<void> {
    const trigger = await this.prisma.trigger.findUnique({
      where: { workflowId },
      select: { id: true, type: true },
    });

    if (trigger?.type === TriggerType.SCHEDULED) {
      await this.unregisterPoller(trigger.id);
    }
  }

  private pollJobId(triggerId: string) {
    return `poll:${triggerId}`;
  }
}
