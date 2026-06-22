import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WorkflowTriggeredEvent } from './workflow-triggered.event';

/**
 * Placeholder listener for "workflow.triggered" events.
 *
 * In Build 7 this will be replaced with real workflow execution logic.
 * For now it logs the event so we can verify the full pipeline works:
 *   webhook hit → HMAC verified → event emitted → listener picks it up.
 */
@Injectable()
export class TriggeredListener {
  private readonly logger = new Logger(TriggeredListener.name);

  @OnEvent('workflow.triggered')
  handleWorkflowTriggered(event: WorkflowTriggeredEvent) {
    this.logger.log(
      `🔔 Workflow triggered: id=${event.workflowId} source=${event.source} ` +
        `payload=${JSON.stringify(event.executionPayload).slice(0, 200)}`,
    );
  }
}
