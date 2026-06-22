import { Injectable, NotFoundException } from '@nestjs/common';
import { TriggerType, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTriggerDto } from './dto/create-trigger.dto';

@Injectable()
export class TriggersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create or update the single trigger for a workflow.
   *
   * If the trigger type is WEBHOOK, auto-generates a 32-byte hex secret
   * used for HMAC-SHA256 signature verification on incoming webhooks.
   * The secret is stored in the DB — the caller never provides it.
   */
  async upsert(workflowId: string, dto: CreateTriggerDto) {
    // Only generate a secret for webhook-type triggers
    const secret =
      dto.type === TriggerType.WEBHOOK
        ? randomBytes(32).toString('hex')
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
  async remove(workflowId: string) {
    const trigger = await this.prisma.trigger.findUnique({
      where: { workflowId },
    });

    if (!trigger) {
      throw new NotFoundException('Trigger not found for this workflow');
    }

    await this.prisma.trigger.delete({ where: { workflowId } });

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
      secret: trigger.secret
        ? trigger.secret.slice(0, 8) + '...'
        : null,
      enabled: trigger.enabled,
      createdAt: trigger.createdAt,
      updatedAt: trigger.updatedAt,
    };
  }
}
