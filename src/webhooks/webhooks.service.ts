import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, TriggerType, WorkflowStatus } from '@prisma/client';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

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
    idempotencyKeyHeader: string | undefined,
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
    if (!trigger || trigger.type !== TriggerType.WEBHOOK) {
      throw new BadRequestException('Workflow does not have a webhook trigger');
    }

    // Step 2: HMAC verification if the trigger has a secret
    if (trigger.secret) {
      this.verifyHmac(rawBody, trigger.secret, signature);
    }

    const idempotencyKey =
      idempotencyKeyHeader?.trim() ||
      this.buildFingerprint(workflowId, parsedBody);

    const existingEvent = await this.prisma.webhookEvent.findUnique({
      where: {
        workflowId_idempotencyKey: {
          workflowId,
          idempotencyKey,
        },
      },
    });

    if (existingEvent) {
      return {
        received: true,
        duplicate: true,
        eventId: existingEvent.id,
      };
    }

    // Step 3: Log the event — handle the race where two identical requests
    // arrive simultaneously and both pass the duplicate check above.
    let event: Awaited<ReturnType<typeof this.prisma.webhookEvent.create>>;
    try {
      event = await this.prisma.webhookEvent.create({
        data: {
          workflowId,
          payload: parsedBody as Prisma.InputJsonObject,
          status: 'RECEIVED',
          idempotencyKey,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const dup = await this.prisma.webhookEvent.findUnique({
          where: { workflowId_idempotencyKey: { workflowId, idempotencyKey } },
        });
        return { received: true, duplicate: true, eventId: dup?.id ?? '' };
      }
      throw err;
    }

    // Step 4: Fire-and-forget event emission
    this.eventEmitter.emit('workflow.triggered', {
      workflowId,
      executionPayload: parsedBody,
      source: 'webhook',
      webhookEventId: event.id,
    });

    this.logger.log(
      `Webhook received for workflow ${workflowId}, event ${event.id}`,
    );

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

    if (!workflow || workflow.status !== WorkflowStatus.ACTIVE) {
      throw new NotFoundException('Workflow not found or not active');
    }

    const event = await this.prisma.webhookEvent.create({
      data: {
        workflowId,
        payload: body as Prisma.InputJsonObject,
        status: 'MANUAL',
      },
    });

    this.eventEmitter.emit('workflow.triggered', {
      workflowId,
      executionPayload: body,
      source: 'manual',
      webhookEventId: event.id,
    });

    this.logger.log(
      `Manual fire for workflow ${workflowId}, event ${event.id}`,
    );

    return { fired: true, eventId: event.id };
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
      throw new UnauthorizedException({ error: 'Missing signature' });
    }

    const expected =
      'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');

    const expectedBuffer = Buffer.from(expected);
    const receivedBuffer = Buffer.from(signature);

    if (
      expectedBuffer.length !== receivedBuffer.length ||
      !timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
      throw new UnauthorizedException({ error: 'Invalid signature' });
    }
  }

  private buildFingerprint(
    workflowId: string,
    parsedBody: Record<string, unknown>,
  ) {
    // Deterministic hash — no timestamp. Two identical payloads sent at any
    // interval map to the same key, enabling dedup across real retry windows
    // (GitHub retries at 60s, Stripe at 30-90s). Senders with legitimately
    // identical payloads must supply an explicit X-Idempotency-Key header.
    return createHash('sha256')
      .update(workflowId + JSON.stringify(parsedBody))
      .digest('hex');
  }
}
