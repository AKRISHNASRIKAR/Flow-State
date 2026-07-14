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

export interface IActionExecutor {
  execute(
    config: Record<string, unknown>,
    payload: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<ActionResult>;
}
