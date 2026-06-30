export interface WorkflowTriggeredEvent {
  workflowId: string;
  executionPayload: unknown;
  source: 'webhook' | 'manual' | 'poll';
  webhookEventId?: string;
}
