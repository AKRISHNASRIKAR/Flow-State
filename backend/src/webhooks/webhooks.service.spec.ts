import { UnauthorizedException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TriggerType, WorkflowStatus } from '@prisma/client';
import { createHmac } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { WebhooksService } from './webhooks.service';

const WORKFLOW_ID = '00000000-0000-0000-0000-000000000001';
const SECRET = 'test-secret';

function sign(body: Buffer, secret = SECRET) {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}

/**
 * verifyHmac is private and on the high-risk list, so it's exercised through
 * handleWebhook rather than refactored for testability. A signature that
 * passes verification reaches the idempotency lookup, which is stubbed to
 * report a duplicate so the call ends there.
 */
function buildService() {
  const prisma = {
    workflow: {
      findUnique: jest.fn().mockResolvedValue({
        id: WORKFLOW_ID,
        status: WorkflowStatus.ACTIVE,
        triggers: [{ id: 't1', type: TriggerType.WEBHOOK, secret: SECRET }],
      }),
    },
    webhookEvent: {
      findUnique: jest.fn().mockResolvedValue({ id: 'evt_1' }),
    },
  };
  const service = new WebhooksService(
    prisma as unknown as PrismaService,
    new EventEmitter2(),
  );
  return { service, prisma };
}

describe('WebhooksService HMAC verification', () => {
  const body = { order: 42 };
  const rawBody = Buffer.from(JSON.stringify(body));

  it('accepts a correct signature over the raw body', async () => {
    const { service, prisma } = buildService();

    await expect(
      service.handleWebhook(
        WORKFLOW_ID,
        rawBody,
        sign(rawBody),
        undefined,
        body,
      ),
    ).resolves.toMatchObject({ duplicate: true, eventId: 'evt_1' });
    expect(prisma.webhookEvent.findUnique).toHaveBeenCalled();
  });

  it('rejects a missing signature', async () => {
    const { service, prisma } = buildService();

    await expect(
      service.handleWebhook(WORKFLOW_ID, rawBody, undefined, undefined, body),
    ).rejects.toThrow(UnauthorizedException);
    expect(prisma.webhookEvent.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a signature made with the wrong secret', async () => {
    const { service } = buildService();

    await expect(
      service.handleWebhook(
        WORKFLOW_ID,
        rawBody,
        sign(rawBody, 'other-secret'),
        undefined,
        body,
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a signature over a re-serialised body', async () => {
    // The whole reason main.ts preserves the raw body: whitespace or key
    // order changes after JSON parsing must not verify.
    const { service } = buildService();
    const reformatted = Buffer.from(JSON.stringify(body, null, 2));

    await expect(
      service.handleWebhook(
        WORKFLOW_ID,
        rawBody,
        sign(reformatted),
        undefined,
        body,
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a length-mismatched signature without throwing a RangeError', async () => {
    const { service } = buildService();

    await expect(
      service.handleWebhook(
        WORKFLOW_ID,
        rawBody,
        'sha256=abc',
        undefined,
        body,
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a bare hex digest without the sha256= prefix', async () => {
    const { service } = buildService();
    const bare = sign(rawBody).slice('sha256='.length);

    await expect(
      service.handleWebhook(WORKFLOW_ID, rawBody, bare, undefined, body),
    ).rejects.toThrow(UnauthorizedException);
  });
});
