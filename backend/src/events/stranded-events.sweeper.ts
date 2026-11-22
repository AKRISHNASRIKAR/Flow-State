import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { WorkflowTriggeredEvent } from './workflow-triggered.event';

const SWEEP_EVERY_MS = 5 * 60 * 1000;
/** Old enough that the original admission has certainly finished or died. */
const STRANDED_AFTER_MS = 2 * 60 * 1000;
/** A delivery that still can't be admitted after a day is left alone. */
const GIVE_UP_AFTER_MS = 24 * 60 * 60 * 1000;
const SWEEP_BATCH = 20;

/**
 * Re-admits webhook deliveries that were acknowledged (200 sent, event
 * stored as RECEIVED) but never admitted - the process died, or admission
 * threw, before a run was created. The sender won't redeliver, and its
 * idempotency key would be refused as a duplicate if it did, so without
 * this the delivery is silently lost. Port of the worker's recoverStranded.
 *
 * Safe on every instance at once: TriggeredListener claims an event in the
 * same transaction that creates its run, so a re-emitted event that was
 * admitted meanwhile is dropped rather than run twice.
 */
@Injectable()
export class StrandedEventsSweeper implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StrandedEventsSweeper.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.sweep(), SWEEP_EVERY_MS);
    // Never keep a shutting-down process alive just for the sweep.
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async sweep(): Promise<void> {
    try {
      const at = Date.now();
      const stranded = await this.prisma.webhookEvent.findMany({
        where: {
          status: 'RECEIVED',
          receivedAt: {
            lt: new Date(at - STRANDED_AFTER_MS),
            gt: new Date(at - GIVE_UP_AFTER_MS),
          },
        },
        orderBy: { receivedAt: 'asc' },
        take: SWEEP_BATCH,
        select: { id: true, workflowId: true, payload: true },
      });

      for (const event of stranded) {
        this.logger.warn(`Re-admitting stranded webhook event ${event.id}`);
        this.eventEmitter.emit('workflow.triggered', {
          workflowId: event.workflowId,
          executionPayload: event.payload,
          source: 'webhook',
          webhookEventId: event.id,
        } satisfies WorkflowTriggeredEvent);
      }
    } catch (error) {
      this.logger.error('Stranded-event sweep failed', error);
    }
  }
}
