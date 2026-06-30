import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { WorkflowTriggeredEvent } from './workflow-triggered.event';

/**
 * Placeholder listener for "workflow.triggered" events.
 *
 * When the execution engine arrives (Build 7), this listener will enqueue
 * a BullMQ job instead of logging. The worker will run the action chain,
 * write workflow_executions / action_executions rows, and update the
 * webhook_events status to PROCESSED or FAILED.
 *
 * For now it marks the webhook event as PROCESSED so the event history
 * table reflects handoff rather than leaving every event stuck at RECEIVED.
 */
@Injectable()
export class TriggeredListener {
  private readonly logger = new Logger(TriggeredListener.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent('workflow.triggered')
  async handleTriggered(payload: WorkflowTriggeredEvent) {
    this.logger.log(
      `workflow.triggered workflowId=${payload.workflowId} source=${payload.source}`,
    );

    if (payload.webhookEventId) {
      await this.prisma.webhookEvent
        .update({
          where: { id: payload.webhookEventId },
          data: { status: 'PROCESSED' },
        })
        .catch((err: unknown) => {
          this.logger.error(
            `Failed to mark webhookEvent ${payload.webhookEventId} as PROCESSED`,
            err,
          );
        });
    }
  }
}
