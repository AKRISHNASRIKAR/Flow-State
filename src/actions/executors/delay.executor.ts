import {
  ActionResult,
  IActionExecutor,
} from '../interfaces/action-executor.interface';

interface DelayConfig {
  seconds: number;
}

/**
 * DELAY never sleeps inside the executor. Blocking a worker thread on
 * setTimeout would hold a BullMQ concurrency slot for no reason — the actual
 * pause is implemented by WorkflowProcessor re-enqueuing the remaining
 * actions as a new job with BullMQ's `delay` option, which frees the worker
 * to process other jobs while the clock runs. This executor only reports
 * what the requested delay was so the caller can build that re-enqueue.
 */
export class DelayExecutor implements IActionExecutor {
  execute(config: Record<string, unknown>): Promise<ActionResult> {
    const { seconds } = config as unknown as DelayConfig;

    return Promise.resolve({
      success: true,
      response: { delayedBy: seconds },
    });
  }
}
