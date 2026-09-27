import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, TriggerType, WorkflowStatus } from '@prisma/client';
import { Job } from 'bullmq';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { getRedisConnectionOptions } from './redis-options';
import {
  evaluatePoll,
  fetchPollEndpoint,
  PollOutcome,
  PollState,
} from './poll-change';
import { normalizePollingConfig, PollingConfig } from './polling-config';
import { ConfigService } from '@nestjs/config';
import { PollingJobData } from './scheduler.service';

const POLLING_STATE_TTL_SECONDS = 86_400;

@Injectable()
@Processor('polling')
export class PollingWorker extends WorkerHost implements OnModuleDestroy {
  private readonly logger = new Logger(PollingWorker.name);
  private readonly redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    configService: ConfigService,
  ) {
    super();
    this.redis = new Redis(getRedisConnectionOptions(configService));
  }

  async process(job: Job<PollingJobData>) {
    const trigger = await this.prisma.trigger.findUnique({
      where: { id: job.data.triggerId },
      include: { workflow: true },
    });

    if (
      !trigger ||
      trigger.type !== TriggerType.SCHEDULED ||
      !trigger.enabled ||
      trigger.workflow.status !== WorkflowStatus.ACTIVE
    ) {
      return;
    }

    let config: PollingConfig;
    try {
      config = normalizePollingConfig(trigger.config);
    } catch (error) {
      await this.logPollingEvent(
        trigger.id,
        false,
        undefined,
        getErrorMessage(error),
      );
      return;
    }

    let outcome: PollOutcome;
    try {
      const responseBody = await fetchPollEndpoint(config);
      outcome = evaluatePoll(
        config,
        responseBody,
        await this.readLastState(this.stateKey(trigger.id)),
      );
    } catch (error) {
      await this.logPollingEvent(
        trigger.id,
        false,
        undefined,
        getErrorMessage(error),
      );
      return;
    }

    await this.writeState(this.stateKey(trigger.id), outcome.state);

    if (outcome.kind !== 'changed') {
      await this.logPollingEvent(trigger.id, false);
      return;
    }

    for (const payload of outcome.payloads) {
      this.eventEmitter.emit('workflow.triggered', {
        workflowId: trigger.workflowId,
        executionPayload: payload,
        source: 'poll',
      });
    }

    await this.logPollingEvent(trigger.id, true, outcome.snapshot);
    this.logger.log(`Polling trigger changed: ${trigger.id}`);
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  private async readLastState(key: string) {
    const value = await this.redis.get(key);

    if (!value) {
      return null;
    }

    try {
      return JSON.parse(value) as PollState;
    } catch {
      return null;
    }
  }

  private async writeState(key: string, state: PollState) {
    await this.redis.set(
      key,
      JSON.stringify(state),
      'EX',
      POLLING_STATE_TTL_SECONDS,
    );
  }

  private stateKey(triggerId: string) {
    return `poll:state:${triggerId}`;
  }

  private async logPollingEvent(
    triggerId: string,
    changed: boolean,
    responseSnapshot?: unknown,
    error?: string,
  ) {
    await this.prisma.pollingEvent.create({
      data: {
        triggerId,
        changed,
        responseSnapshot:
          responseSnapshot === undefined
            ? undefined
            : (responseSnapshot as Prisma.InputJsonValue),
        error,
      },
    });
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
