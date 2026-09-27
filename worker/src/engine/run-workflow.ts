import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { createExecutorRegistry, runAction } from '../../../backend/src/actions/run-action';
import { now, withDb } from '../db';
import { configReader, type Env } from '../env';
import {
  audit,
  findExecution,
  finishStep,
  finishStepStatement,
  setExecution,
  setExecutionStatement,
  startStep,
  succeededActionIds,
} from '../repo/executions';
import { listActions } from '../repo/workflows';

export interface RunParams {
  executionId: string;
}

// Same budget as the backend's BullMQ job (3 attempts, exponential from 2s) —
// but per step, so only the failing step is retried.
const STEP_RETRIES = { limit: 2, delay: '2 seconds', backoff: 'exponential' } as const;
// Executors time out their own network calls at 10–15s; this only catches a hang.
const STEP_TIMEOUT = '2 minutes';

// Step results must be serialisable; config and payload are arbitrary JSON
// the type system can't prove that about, so they cross step boundaries as
// JSON strings.
interface Plan {
  userId: string;
  workflowId: string;
  actions: { id: string; type: string; config: Record<string, unknown> }[];
  succeeded: string[];
  payload: string;
}

/**
 * One instance per WorkflowExecution (instance id = execution id). Replaces
 * BullMQ + WorkflowProcessor.
 *
 * Cloudflare persists each `step.do` result, so when the instance is retried
 * or resumed, completed steps are skipped and their saved output is reused —
 * the resume-from-failure behaviour the backend implements by hand, here
 * provided by the platform. Code outside `step.do` re-runs on every replay,
 * so it must stay deterministic: all I/O lives inside steps.
 */
export class RunWorkflow extends WorkflowEntrypoint<Env, RunParams> {
  async run(event: WorkflowEvent<RunParams>, step: WorkflowStep): Promise<void> {
    const { executionId } = event.payload;

    const planJson = await step.do('load', () => this.load(executionId));
    if (!planJson) return;
    const plan = JSON.parse(planJson) as Plan;

    let payload = plan.payload;
    for (const action of plan.actions) {
      // Already succeeded in an earlier run of this execution (an admin
      // retry after the run failed for good).
      if (plan.succeeded.includes(action.id)) continue;

      if (action.type === 'DELAY') {
        const seconds = Number(action.config.seconds ?? 0);
        // A durable sleep: no worker is held while it waits — which the
        // backend's inline sleep couldn't avoid.
        if (seconds > 0) await step.sleep(`wait-${action.id}`, seconds * 1000);
      }

      try {
        payload = await step.do(`step-${action.id}`, { retries: STEP_RETRIES, timeout: STEP_TIMEOUT }, () =>
          this.runStep(executionId, plan, action, payload),
        );
      } catch (error) {
        await step.do('fail', () => this.fail(executionId, plan, action.id, error));
        return;
      }
    }

    await step.do('finish', () => this.finish(executionId, plan, payload));
  }

  private load(executionId: string): Promise<string | null> {
    return withDb(this.env, async (db) => {
      const execution = await findExecution(db, executionId);
      // Cancelled while queued — nothing to do.
      if (!execution || execution.status === 'CANCELLED') return null;

      const actions = await listActions(db, execution.workflowId);
      const succeeded = await succeededActionIds(db, executionId);
      await setExecution(db, executionId, { status: 'RUNNING', startedAt: now(), error: null, finishedAt: null });

      // `output` is checkpointed after every successful step, so on a retry
      // it's exactly the payload the next unfinished step should see.
      const payload = (succeeded.length > 0 ? (execution.output ?? execution.input) : execution.input) ?? {};
      const plan: Plan = {
        userId: execution.userId,
        workflowId: execution.workflowId,
        actions: actions.map((a) => ({ id: a.id, type: a.type, config: a.config })),
        succeeded,
        payload: JSON.stringify(payload),
      };
      return JSON.stringify(plan);
    });
  }

  /** One attempt of one step. Throws on failure so Workflows retries it. */
  private runStep(executionId: string, plan: Plan, action: Plan['actions'][number], payloadJson: string) {
    return withDb(this.env, async (db) => {
      const payload = JSON.parse(payloadJson) as Record<string, unknown>;
      const stepId = await startStep(db, executionId, action.id, payload);
      const result = await runAction(
        createExecutorRegistry(configReader(this.env), console),
        action.type,
        action.config,
        payload,
        { userId: plan.userId, workflowId: plan.workflowId, executionId },
      );

      if (!result.success) {
        await finishStep(db, stepId, { status: 'FAILED', error: result.error ?? 'Unknown action failure' });
        throw new Error(result.error ?? 'Unknown action failure');
      }

      const next = result.enrichedPayload ? { ...payload, ...result.enrichedPayload } : payload;
      // Step row and checkpoint commit together — a SUCCEEDED row must always
      // mean its output is in the checkpoint (see CLAUDE.md high-risk #9).
      // One atomic D1 batch.
      await db.batch([
        finishStepStatement(db, stepId, { status: 'SUCCEEDED', output: result.response ?? {} }),
        setExecutionStatement(db, executionId, { output: next }),
      ]);
      return JSON.stringify(next);
    });
  }

  private fail(executionId: string, plan: Plan, actionId: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return withDb(this.env, async (db) => {
      await setExecution(db, executionId, { status: 'FAILED', error: message, finishedAt: now() });
      await audit(db, plan.userId, 'WORKFLOW_RUN', {
        entityType: 'workflow_executions',
        entityId: executionId,
        event: 'workflow.executed',
        workflowId: plan.workflowId,
        status: 'FAILED',
        failedActionId: actionId,
      });
    });
  }

  private finish(executionId: string, plan: Plan, payloadJson: string) {
    return withDb(this.env, async (db) => {
      await setExecution(db, executionId, {
        status: 'SUCCEEDED',
        output: JSON.parse(payloadJson) as unknown,
        finishedAt: now(),
      });
      await audit(db, plan.userId, 'WORKFLOW_RUN', {
        entityType: 'workflow_executions',
        entityId: executionId,
        event: 'workflow.executed',
        workflowId: plan.workflowId,
        status: 'SUCCEEDED',
      });
    });
  }
}
