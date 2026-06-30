import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, TriggerType, WorkflowStatus } from '@prisma/client';
import { Job } from 'bullmq';
import Redis from 'ioredis';
import { JSONPath } from 'jsonpath-plus';
import { PrismaService } from '../prisma/prisma.service';
import { getRedisConnectionOptions } from './redis-options';
import {
  isRecord,
  normalizePollingConfig,
  PollingChangeMode,
  PollingConfig,
} from './polling-config';
import { ConfigService } from '@nestjs/config';
import { PollingJobData } from './scheduler.service';

const POLLING_STATE_TTL_SECONDS = 86_400;
const POLLING_TIMEOUT_MS = 15_000;

type JsonPathJson = null | boolean | number | string | object | unknown[];

interface PollState {
  mode: PollingChangeMode;
  comparison: unknown;
  items?: unknown[];
}

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

    let responseBody: unknown;
    try {
      responseBody = await this.fetchEndpoint(config);
    } catch (error) {
      await this.logPollingEvent(
        trigger.id,
        false,
        undefined,
        getErrorMessage(error),
      );
      return;
    }

    let newState: PollState;
    try {
      newState = this.buildState(config, responseBody);
    } catch (error) {
      await this.logPollingEvent(
        trigger.id,
        false,
        undefined,
        getErrorMessage(error),
      );
      return;
    }

    const stateKey = this.stateKey(trigger.id);
    const lastState = await this.readLastState(stateKey);

    if (!lastState) {
      await this.writeState(stateKey, newState);
      await this.logPollingEvent(trigger.id, false);
      return;
    }

    if (this.statesEqual(config.changeMode, lastState, newState)) {
      await this.writeState(stateKey, newState);
      await this.logPollingEvent(trigger.id, false);
      return;
    }

    if (config.changeMode === 'array_length') {
      const newItems = this.getNewItems(
        lastState.items ?? [],
        newState.items ?? [],
      );

      for (const item of newItems) {
        this.eventEmitter.emit('workflow.triggered', {
          workflowId: trigger.workflowId,
          executionPayload: item,
          source: 'poll',
        });
      }
    } else {
      this.eventEmitter.emit('workflow.triggered', {
        workflowId: trigger.workflowId,
        executionPayload: responseBody,
        source: 'poll',
      });
    }

    await this.writeState(stateKey, newState);
    await this.logPollingEvent(trigger.id, true, responseBody);

    this.logger.log(`Polling trigger changed: ${trigger.id}`);
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  private async fetchEndpoint(config: PollingConfig) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), POLLING_TIMEOUT_MS);

    try {
      const response = await fetch(config.endpoint, {
        method: config.method,
        headers: config.headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        return await response.json();
      }

      return await response.text();
    } finally {
      clearTimeout(timeout);
    }
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

  private buildState(config: PollingConfig, responseBody: unknown): PollState {
    if (config.changeMode === 'array_length') {
      const items = this.extractArray(responseBody, config.stateKey);

      return {
        mode: config.changeMode,
        comparison: items.length,
        items,
      };
    }

    const comparison =
      config.changeMode === 'specific_field'
        ? this.extractStateValue(responseBody, config.stateKey)
        : JSON.stringify(responseBody);

    return {
      mode: config.changeMode,
      comparison,
    };
  }

  private statesEqual(
    changeMode: PollingChangeMode,
    lastState: PollState,
    newState: PollState,
  ) {
    if (changeMode === 'array_length') {
      return lastState.comparison === newState.comparison;
    }

    return (
      JSON.stringify(lastState.comparison) ===
      JSON.stringify(newState.comparison)
    );
  }

  private getNewItems(previousItems: unknown[], currentItems: unknown[]) {
    const previous = new Set(previousItems.map((item) => JSON.stringify(item)));

    return currentItems.filter((item) => !previous.has(JSON.stringify(item)));
  }

  private extractArray(responseBody: unknown, stateKey?: string) {
    const value = stateKey
      ? this.extractStateValue(responseBody, stateKey)
      : responseBody;

    return Array.isArray(value) ? value : [];
  }

  private extractStateValue(responseBody: unknown, stateKey?: string) {
    if (!stateKey) {
      return responseBody;
    }

    if (stateKey.startsWith('$')) {
      return JSONPath({
        path: stateKey,
        json: responseBody as JsonPathJson,
        wrap: false,
      });
    }

    return isRecord(responseBody) ? responseBody[stateKey] : undefined;
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
