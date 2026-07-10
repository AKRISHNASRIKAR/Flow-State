import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import {
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ExecutionStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { Public } from '../auth/decorators/public.decorator';
import {
  WORKFLOW_EXECUTION_QUEUE,
  WorkflowExecutionJobData,
} from '../executions/execution-queue.module';
import { PrismaService } from '../prisma/prisma.service';
import { AdminGuard } from './admin.guard';

const FAILED_JOBS_PAGE_SIZE = 100;

@ApiTags('Admin')
@ApiHeader({ name: 'x-admin-secret', description: 'Shared admin secret' })
@Controller('admin')
@Public()
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(WORKFLOW_EXECUTION_QUEUE)
    private readonly executionQueue: Queue<WorkflowExecutionJobData>,
  ) {}

  @Get('failed-jobs')
  @ApiOperation({
    summary: 'List dead-lettered jobs',
    description:
      'Jobs in the workflow-execution queue that exhausted all retry attempts.',
  })
  @ApiResponse({ status: 200, description: 'List of failed jobs' })
  @ApiResponse({ status: 401, description: 'Missing or invalid admin secret' })
  async listFailedJobs() {
    const jobs = await this.executionQueue.getFailed(0, FAILED_JOBS_PAGE_SIZE);

    return jobs.map((job) => ({
      jobId: job.id,
      executionId: job.data.executionId,
      error: job.failedReason,
      failedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
      attemptsMade: job.attemptsMade,
      data: job.data,
    }));
  }

  @Post('failed-jobs/:jobId/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Requeue a dead-lettered job',
    description:
      'Moves a failed job back to the waiting state and resets its WorkflowExecution to PENDING.',
  })
  @ApiParam({ name: 'jobId', description: 'BullMQ job ID (== execution ID)' })
  @ApiResponse({ status: 200, description: 'Job requeued' })
  @ApiResponse({ status: 401, description: 'Missing or invalid admin secret' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async retryFailedJob(@Param('jobId') jobId: string) {
    const job = await this.executionQueue.getJob(jobId);

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    await job.retry();

    await this.prisma.workflowExecution
      .update({
        where: { id: job.data.executionId },
        data: {
          status: ExecutionStatus.PENDING,
          error: null,
          finishedAt: null,
        },
      })
      .catch(() => undefined);

    return { requeued: true };
  }
}
