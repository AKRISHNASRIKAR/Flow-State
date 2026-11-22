import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { NonRetryableError } from 'cloudflare:workflows';
import { createExecutorRegistry, runAction } from '../../../backend/src/actions/run-action';
import { now, withDb } from '../db';
import { configReader, type Env } from '../env';
import {
  audit,
  findExecution,
  finishStep,
  finishStepStatement,
  setExecutionStatement,
  startStep,
  succeededActionIds,
  transitionExecution,
} from '../repo/executions';
import { listActions } from '../repo/workflows';

export interface RunParams {
  executionId: string;
}

// Same budget as the backend's BullMQ job (3 attempts, exponential from 2s) -
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
 * or resumed, completed steps are skipped and their saved output is reused -
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
        // A durable sleep: no worker is held while it waits - which the
        // backend's inline sleep couldn't avoid.
        if (seconds > 0) await step.sleep(`wait-${action.id}`, seconds * 1000);
      }

      let next: string | null;
      try {
        next = await step.do(`step-${action.id}`, { retries: STEP_RETRIES, timeout: STEP_TIMEOUT }, () =>
          this.runStep(executionId, plan, action, payload),
        );
      } catch (error) {
        await step.do('fail', () => this.fail(executionId, plan, action.id, error));
        return;
      }
      // Cancelled between steps (or while a DELAY slept): stop before the
      // next side effect. The cancel already wrote the final status.
      if (next === null) return;
      payload = next;
    }

    await step.do('finish', () => this.finish(executionId, plan, payload));
  }

  private load(executionId: string): Promise<string | null> {
    return withDb(this.env, async (db) => {
      const execution = await findExecution(db, executionId);
      // Cancelled while queued - nothing to do.
      if (!execution || execution.status === 'CANCELLED') return null;

      const actions = await listActions(db, execution.workflowId);
      const succeeded = await succeededActionIds(db, executionId);
      // Guarded: a cancel landing between the read above and this write must
      // win, not be overwritten with RUNNING.
      const started = await transitionExecution(db, executionId, ['PENDING', 'RUNNING'], {
        status: 'RUNNING',
        startedAt: now(),
        error: null,
        finishedAt: null,
      });
      if (!started) return null;

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

  /**
   * One attempt of one step. Throws on failure so Workflows retries it -
   * a NonRetryableError when the executor says retrying can't help. Returns
   * the next payload, or null when the run was cancelled before this step.
   */
  private runStep(
    executionId: string,
    plan: Plan,
    action: Plan['actions'][number],
    payloadJson: string,
  ): Promise<string | null> {
    return withDb(this.env, async (db) => {
      const payload = JSON.parse(payloadJson) as Record<string, unknown>;
      const stepId = await startStep(db, executionId, action.id, payload);
      if (!stepId) return null;
      const result = await runAction(
        createExecutorRegistry(configReader(this.env), console),
        action.type,
        action.config,
        payload,
        { userId: plan.userId, workflowId: plan.workflowId, executionId },
      );

      if (!result.success) {
        const message = result.error ?? 'Unknown action failure';
        await finishStep(db, stepId, { status: 'FAILED', error: message });
        throw result.retryable === false ? new NonRetryableError(message) : new Error(message);
      }

      const next = result.enrichedPayload ? { ...payload, ...result.enrichedPayload } : payload;
      // Step row and checkpoint commit together - a SUCCEEDED row must always
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
      // Not over a cancel that landed while the step was retrying.
      const failed = await transitionExecution(db, executionId, ['RUNNING'], {
        status: 'FAILED',
        error: message,
        finishedAt: now(),
      });
      if (!failed) return;
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
      const finished = await transitionExecution(db, executionId, ['RUNNING'], {
        status: 'SUCCEEDED',
        output: JSON.parse(payloadJson) as unknown,
        finishedAt: now(),
      });
      if (!finished) return;
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
