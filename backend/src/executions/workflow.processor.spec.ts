import { ExecutionStatus } from '@prisma/client';
import { Job, UnrecoverableError } from 'bullmq';
import { ActionExecutorService } from '../actions/action-executor.service';
import { ActionResult } from '../actions/interfaces/action-executor.interface';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../shared/audit-log.service';
import { WorkflowExecutionJobData } from './execution-queue.module';
import { WorkflowProcessor } from './workflow.processor';

const EXECUTION_ID = 'exec-1';
const ACTIONS = [
  { id: 'a1', type: 'HTTP_REQUEST', config: {}, position: 0 },
  { id: 'a2', type: 'LOG_MESSAGE', config: {}, position: 1 },
  { id: 'a3', type: 'LOG_MESSAGE', config: {}, position: 2 },
];

interface Scenario {
  input?: Record<string, unknown>;
  /** Status reads (isCancelled) after the initial load return this. */
  statusAfterStart?: ExecutionStatus;
  checkpoint?: Record<string, unknown> | null;
  succeededActionIds?: string[];
  results: Record<string, ActionResult>;
}

interface RecordedUpdate {
  status?: ExecutionStatus;
  output?: unknown;
  error?: string;
}

function setup({
  input = { order: 1 },
  statusAfterStart = ExecutionStatus.RUNNING,
  checkpoint = null,
  succeededActionIds = [],
  results,
}: Scenario) {
  let rowSeq = 0;
  const checkpoints: unknown[] = [];
  const executionUpdates: RecordedUpdate[] = [];
  const stepUpdates: RecordedUpdate[] = [];
  const createdActionIds: string[] = [];

  const prisma = {
    workflowExecution: {
      findUnique: jest
        .fn()
        .mockResolvedValueOnce({
          id: EXECUTION_ID,
          workflowId: 'wf-1',
          status: ExecutionStatus.PENDING,
          input,
          output: checkpoint,
          workflow: { userId: 'user-1' },
        })
        .mockResolvedValue({ status: statusAfterStart }),
      update: jest.fn((args: { data: RecordedUpdate }) => {
        executionUpdates.push(args.data);
        // A checkpoint is an output write that doesn't also finish the run.
        if ('output' in args.data && !args.data.status) {
          checkpoints.push(args.data.output);
        }
        return Promise.resolve({});
      }),
      // Guarded status writes. A cancelled run matches none but the start.
      updateMany: jest.fn(
        (args: { where: { status?: unknown }; data: RecordedUpdate }) => {
          const guardedOnRunning =
            args.where.status === ExecutionStatus.RUNNING;
          if (
            guardedOnRunning &&
            statusAfterStart === ExecutionStatus.CANCELLED
          ) {
            return Promise.resolve({ count: 0 });
          }
          executionUpdates.push(args.data);
          return Promise.resolve({ count: 1 });
        },
      ),
    },
    action: { findMany: jest.fn().mockResolvedValue(ACTIONS) },
    actionExecution: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          succeededActionIds.map((actionId) => ({ actionId })),
        ),
      create: jest.fn((args: { data: { actionId: string } }) => {
        createdActionIds.push(args.data.actionId);
        return Promise.resolve({ id: `row-${++rowSeq}` });
      }),
      update: jest.fn((args: { data: RecordedUpdate }) => {
        stepUpdates.push(args.data);
        return Promise.resolve({});
      }),
    },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };

  const executed: { type: string; actionPayload: Record<string, unknown> }[] =
    [];
  let call = 0;
  const actionExecutor = {
    execute: jest.fn(
      (
        type: string,
        _config: unknown,
        actionPayload: Record<string, unknown>,
      ) => {
        const action = ACTIONS.filter(
          (a) => !succeededActionIds.includes(a.id),
        )[call++];
        executed.push({ type, actionPayload: { ...actionPayload } });
        return Promise.resolve(results[action.id] ?? { success: true });
      },
    ),
  };

  const processor = new WorkflowProcessor(
    prisma as unknown as PrismaService,
    actionExecutor as unknown as ActionExecutorService,
    { log: jest.fn() } as unknown as AuditLogService,
  );
  const job = {
    data: { executionId: EXECUTION_ID },
  } as Job<WorkflowExecutionJobData>;

  return {
    processor,
    job,
    executed,
    checkpoints,
    executionUpdates,
    stepUpdates,
    createdActionIds,
  };
}

describe('WorkflowProcessor', () => {
  it('runs every action in order on a first attempt', async () => {
    const { processor, job, executed, executionUpdates } = setup({
      results: {},
    });

    await processor.process(job);

    expect(executed).toHaveLength(3);
    expect(executionUpdates.at(-1)?.status).toBe(ExecutionStatus.SUCCEEDED);
  });

  it('threads enrichedPayload into later steps and checkpoints it', async () => {
    const http = { status: 200, body: { id: 'x' } };
    const { processor, job, executed, checkpoints } = setup({
      results: { a1: { success: true, enrichedPayload: { http } } },
    });

    await processor.process(job);

    expect(executed[0].actionPayload).toEqual({ order: 1 });
    expect(executed[1].actionPayload).toEqual({ order: 1, http });
    expect(checkpoints[0]).toEqual({ order: 1, http });
  });

  it('resumes a retry after the steps that already succeeded', async () => {
    const checkpoint = { order: 1, http: { status: 200, body: {} } };
    const { processor, job, executed, createdActionIds } = setup({
      checkpoint,
      succeededActionIds: ['a1'],
      results: {},
    });

    await processor.process(job);

    expect(executed).toHaveLength(2);
    expect(executed[0].actionPayload).toEqual(checkpoint);
    expect(createdActionIds).toEqual(['a2', 'a3']);
  });

  it('falls back to the trigger input when a legacy run has no checkpoint', async () => {
    const { processor, job, executed } = setup({
      checkpoint: null,
      succeededActionIds: ['a1'],
      results: {},
    });

    await processor.process(job);

    expect(executed[0].actionPayload).toEqual({ order: 1 });
  });

  it('stops at a failed step, does not checkpoint it, and rethrows for BullMQ', async () => {
    const { processor, job, executed, checkpoints, stepUpdates } = setup({
      results: {
        a2: {
          success: false,
          error: 'boom',
          enrichedPayload: { leaked: true },
        },
      },
    });

    await expect(processor.process(job)).rejects.toThrow('boom');

    expect(executed).toHaveLength(2);
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0]).not.toHaveProperty('leaked');
    expect(stepUpdates.at(-1)).toMatchObject({
      status: ExecutionStatus.FAILED,
      error: 'boom',
    });
  });

  it('throws UnrecoverableError when the executor says retrying cannot help', async () => {
    const { processor, job } = setup({
      results: { a1: { success: false, error: 'HTTP 404', retryable: false } },
    });

    const error: unknown = await processor
      .process(job)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnrecoverableError);
  });

  it('stops before the next step once the run is cancelled, and never overwrites it', async () => {
    const { processor, job, executed, executionUpdates } = setup({
      statusAfterStart: ExecutionStatus.CANCELLED,
      results: {},
    });

    await processor.process(job);

    expect(executed).toHaveLength(0);
    expect(executionUpdates.map((u) => u.status)).toEqual([
      ExecutionStatus.RUNNING,
    ]);
  });
});
