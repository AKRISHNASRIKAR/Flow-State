import {
  ActionResult,
  IActionExecutor,
} from '../interfaces/action-executor.interface';

interface DelayConfig {
  seconds: number;
}

/**
 * DELAY doesn't sleep here — WorkflowProcessor sleeps inline *before*
 * calling this, which holds the worker's concurrency slot for the whole
 * delay (a documented simplification; see the processor). This executor
 * only records what the requested delay was so it shows up in the step's
 * output.
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
