import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, WorkflowStatus } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { WorkflowTriggeredEvent } from '../events/workflow-triggered.event';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Handle an incoming external webhook.
   *
   * 1. Look up the workflow + trigger — 404 if missing or workflow not ACTIVE
   * 2. If the trigger has a secret, verify HMAC-SHA256 signature
   * 3. Log a webhook_events row with status RECEIVED
   * 4. Emit "workflow.triggered" event (fire-and-forget)
   * 5. Return immediately — never await downstream processing
   */
  async handleWebhook(
    workflowId: string,
    rawBody: Buffer,
    signature: string | undefined,
    parsedBody: Record<string, unknown>,
  ) {
    // Step 1: Load workflow + its trigger
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
      include: { triggers: true },
    });

    if (!workflow || workflow.status !== WorkflowStatus.ACTIVE) {
      throw new NotFoundException('Workflow not found or not active');
    }

    // A workflow has at most one trigger (enforced by @@unique)
    const trigger = workflow.triggers[0];
    if (!trigger) {
      throw new NotFoundException('No trigger configured for this workflow');
    }

    // Step 2: HMAC verification if the trigger has a secret
    if (trigger.secret) {
      this.verifyHmac(rawBody, trigger.secret, signature);
    }

    // Step 3: Log the event
    const event = await this.prisma.webhookEvent.create({
      data: {
        workflowId,
        payload: parsedBody as Prisma.InputJsonObject,
        status: 'RECEIVED',
      },
    });

    // Step 4: Fire-and-forget event emission
    this.eventEmitter.emit(
      'workflow.triggered',
      new WorkflowTriggeredEvent(workflowId, parsedBody, 'webhook'),
    );

    this.logger.log(`Webhook received for workflow ${workflowId}, event ${event.id}`);

    // Step 5: Return immediately
    return { received: true, eventId: event.id };
  }

  /**
   * Manual trigger fire (authenticated, skips HMAC).
   *
   * Used for testing workflows from the dashboard without
   * needing to set up a real external webhook sender.
   */
  async manualFire(workflowId: string, body: Record<string, unknown>) {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
      include: { triggers: true },
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    const trigger = workflow.triggers[0];
    if (!trigger) {
      throw new NotFoundException('No trigger configured for this workflow');
    }

    const event = await this.prisma.webhookEvent.create({
      data: {
        workflowId,
        payload: body as Prisma.InputJsonObject,
        status: 'MANUAL',
      },
    });

    this.eventEmitter.emit(
      'workflow.triggered',
      new WorkflowTriggeredEvent(workflowId, body, 'manual'),
    );

    this.logger.log(`Manual fire for workflow ${workflowId}, event ${event.id}`);

    return { received: true, eventId: event.id };
  }

  /**
   * Paginated list of webhook events for a workflow.
   * Useful for debugging: see every webhook that came in, its payload, and status.
   */
  async listEvents(
    workflowId: string,
    page = DEFAULT_PAGE,
    limit = DEFAULT_LIMIT,
    status?: string,
  ) {
    const safePage = Math.max(DEFAULT_PAGE, page);
    const safeLimit = Math.min(Math.max(1, limit), MAX_LIMIT);
    const skip = (safePage - 1) * safeLimit;

    const where: Prisma.WebhookEventWhereInput = {
      workflowId,
      ...(status ? { status } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.webhookEvent.findMany({
        where,
        orderBy: { receivedAt: 'desc' },
        skip,
        take: safeLimit,
      }),
      this.prisma.webhookEvent.count({ where }),
    ]);

    return {
      data: items,
      meta: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  /**
   * Verify HMAC-SHA256 signature.
   *
   * The sender computes: sha256=HMAC(rawBody, secret)
   * We recompute the same and compare using timingSafeEqual
   * to prevent timing attacks (never use === for secret comparison).
   *
   * Format of X-FlowForge-Signature header: "sha256=<hex>"
   */
  private verifyHmac(
    rawBody: Buffer,
    secret: string,
    signature: string | undefined,
  ) {
    if (!signature) {
      throw new UnauthorizedException('Missing X-FlowForge-Signature header');
    }

    // Expected format: "sha256=abc123..."
    const expectedPrefix = 'sha256=';
    if (!signature.startsWith(expectedPrefix)) {
      throw new UnauthorizedException('Invalid signature format');
    }

    const receivedHex = signature.slice(expectedPrefix.length);

    const computedHmac = createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    // Convert both to Buffers for timingSafeEqual
    const receivedBuffer = Buffer.from(receivedHex, 'hex');
    const computedBuffer = Buffer.from(computedHmac, 'hex');

    // timingSafeEqual requires same length — if different, reject
    if (receivedBuffer.length !== computedBuffer.length) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    if (!timingSafeEqual(receivedBuffer, computedBuffer)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
  }
}
