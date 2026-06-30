import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TriggerType, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePollingConfig } from '../scheduler/polling-config';
import { SchedulerService } from '../scheduler/scheduler.service';
import { AuditLogService } from '../shared/audit-log.service';
import { CreateTriggerDto } from './dto/create-trigger.dto';

@Injectable()
export class TriggersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly scheduler: SchedulerService,
  ) {}

  /**
   * Create or update the single trigger for a workflow.
   *
   * If the trigger type is WEBHOOK, auto-generates a 32-byte hex secret
   * used for HMAC-SHA256 signature verification on incoming webhooks.
   * The secret is stored in the DB — the caller never provides it.
   */
  async upsert(workflowId: string, dto: CreateTriggerDto) {
    if (dto.type === TriggerType.SCHEDULED) {
      try {
        normalizePollingConfig(dto.configuration ?? {});
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error
            ? error.message
            : 'Invalid polling trigger configuration',
        );
      }
    }

    const existing = await this.prisma.trigger.findUnique({
      where: { workflowId },
      select: { id: true, type: true, secret: true },
    });

    // Preserve the existing HMAC secret when updating a WEBHOOK trigger so
    // external senders (GitHub, Stripe) keep working. Only generate a new
    // secret the first time a trigger is created as WEBHOOK type.
    // Use the dedicated rotate-secret endpoint for explicit rotation.
    const secret =
      dto.type === TriggerType.WEBHOOK
        ? existing?.type === TriggerType.WEBHOOK
          ? existing.secret
          : randomBytes(32).toString('hex')
        : null;

    const config = (dto.configuration ?? {}) as Prisma.InputJsonObject;

    const trigger = await this.prisma.trigger.upsert({
      where: { workflowId },
      create: {
        workflowId,
        type: dto.type,
        config,
        secret,
      },
      update: {
        type: dto.type,
        config,
        secret,
      },
    });

    if (trigger.type === TriggerType.SCHEDULED) {
      await this.scheduler.registerPoller(trigger.id);
    } else if (existing?.type === TriggerType.SCHEDULED) {
      await this.scheduler.unregisterPoller(existing.id);
    }

    return this.serialize(trigger);
  }

  /**
   * Return the trigger for a workflow, masking the secret to prevent
   * accidental leakage in API responses. Shows only the first 8 chars.
   */
  async findOne(workflowId: string) {
    const trigger = await this.prisma.trigger.findUnique({
      where: { workflowId },
    });

    if (!trigger) {
      throw new NotFoundException('Trigger not found for this workflow');
    }

    return this.serialize(trigger);
  }

  /**
   * Remove the trigger entirely. Returns the deleted trigger data.
   */
  async remove(workflowId: string, userId: string) {
    const trigger = await this.prisma.trigger.findUnique({
      where: { workflowId },
    });

    if (!trigger) {
      throw new NotFoundException('Trigger not found for this workflow');
    }

    if (trigger.type === TriggerType.SCHEDULED) {
      await this.scheduler.unregisterPoller(trigger.id);
    }

    await this.prisma.trigger.delete({ where: { workflowId } });
    await this.auditLog.log(userId, 'trigger.deleted', {
      entityType: 'triggers',
      entityId: trigger.id,
      workflowId,
    });

    return { deleted: true };
  }

  /**
   * Mask the secret: show only the first 8 characters + "..."
   * This prevents the full HMAC key from being visible in GET responses.
   */
  private serialize(trigger: {
    id: string;
    workflowId: string;
    type: TriggerType;
    config: unknown;
    secret: string | null;
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: trigger.id,
      workflowId: trigger.workflowId,
      type: trigger.type,
      configuration: trigger.config,
      secret: trigger.secret ? trigger.secret.slice(0, 8) + '...' : null,
      enabled: trigger.enabled,
      createdAt: trigger.createdAt,
      updatedAt: trigger.updatedAt,
    };
  }
}
