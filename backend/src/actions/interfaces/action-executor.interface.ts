export interface ExecutionContext {
  userId: string;
  workflowId: string;
  executionId: string;
}

export interface ActionResult {
  success: boolean;
  response?: Record<string, unknown>;
  error?: string;
  /** Merged into the running payload so downstream actions can read it. */
  enrichedPayload?: Record<string, unknown>;
}

/**
 * The only configuration an executor may read. NestJS's ConfigService
 * satisfies it structurally; the Cloudflare worker passes its env instead —
 * which is what lets executors (and everything in actions/) run on both.
 */
export interface ConfigReader {
  get<T = string>(key: string): T | undefined;
}

/** Where LOG_MESSAGE writes. NestJS's Logger satisfies it; the worker passes console. */
export interface StepLogger {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface IActionExecutor {
  execute(
    config: Record<string, unknown>,
    payload: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<ActionResult>;
}
