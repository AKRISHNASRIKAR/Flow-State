import { Controller, Get, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { Public } from '../auth/decorators/public.decorator';
import {
  WORKFLOW_EXECUTION_QUEUE,
  WorkflowExecutionJobData,
} from '../executions/execution-queue.module';
import { PrismaService } from '../prisma/prisma.service';
import { getRedisConnectionOptions } from '../scheduler/redis-options';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);
  private readonly redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
    @InjectQueue(WORKFLOW_EXECUTION_QUEUE)
    private readonly executionQueue: Queue<WorkflowExecutionJobData>,
  ) {
    this.redis = new Redis(getRedisConnectionOptions(configService));
  }

  @Get()
  @Public()
  @ApiOperation({
    summary: 'Health check',
    description:
      'Reports database, Redis, and workflow-execution queue health. Intended for load balancers and uptime monitors — no auth required.',
  })
  @ApiResponse({ status: 200, description: 'Health status' })
  async check() {
    const [db, redis, queueDepth, workers] = await Promise.all([
      this.checkDb(),
      this.checkRedis(),
      this.executionQueue.getWaitingCount().catch(() => -1),
      this.executionQueue
        .getWorkers()
        .then((list) => list.length)
        .catch(() => 0),
    ]);

    return {
      status: db && redis ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      db: db ? 'up' : 'down',
      redis: redis ? 'up' : 'down',
      queueDepth,
      workers,
    };
  }

  private async checkDb() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.error('DB health check failed', error);
      return false;
    }
  }

  private async checkRedis() {
    try {
      const pong = await this.redis.ping();
      return pong === 'PONG';
    } catch (error) {
      this.logger.error('Redis health check failed', error);
      return false;
    }
  }
}
