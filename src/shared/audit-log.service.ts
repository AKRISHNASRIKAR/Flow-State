import { Injectable, Logger } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface AuditLogMetadata {
  entityType?: string;
  entityId?: string;
  ipAddress?: string;
  userAgent?: string;
  [key: string]: unknown;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Write an audit log entry. Never throws — a logging failure must not
   * abort the operation being audited. Errors are logged via the NestJS
   * logger so they surface in monitoring without propagating to the caller.
   */
  log(
    userId: string,
    event: AuditAction | string,
    metadata: AuditLogMetadata = {},
  ): void {
    const { entityType = 'system', entityId, ipAddress, userAgent, ...rest } =
      metadata;

    this.prisma.auditLog
      .create({
        data: {
          userId,
          action: event,
          entityType,
          entityId,
          ipAddress,
          userAgent,
          metadata: rest as Prisma.InputJsonObject,
        },
      })
      .catch((err: unknown) => {
        this.logger.error(
          `Failed to write audit log: ${event} for user ${userId}`,
          err instanceof Error ? err.stack : String(err),
        );
      });
  }
}
