/**
 * Event payload emitted when a workflow is triggered.
 *
 * Fired by the webhooks controller (both external webhook hits and manual fires).
 * Consumed by TriggeredListener (logs it now, Build 7 replaces with real execution).
 */
export class WorkflowTriggeredEvent {
  /** The workflow UUID that was triggered */
  workflowId: string;

  /** The JSON payload sent with the trigger (webhook body or manual body) */
  executionPayload: Record<string, unknown>;

  /** How the workflow was triggered */
  source: 'webhook' | 'manual';

  constructor(
    workflowId: string,
    executionPayload: Record<string, unknown>,
    source: 'webhook' | 'manual',
  ) {
    this.workflowId = workflowId;
    this.executionPayload = executionPayload;
    this.source = source;
  }
}
