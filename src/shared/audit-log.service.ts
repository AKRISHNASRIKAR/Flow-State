import { Injectable } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface AuditLogMetadata {
  entityType?: string;
  entityId?: string;
  [key: string]: unknown;
}

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  log(userId: string, event: AuditAction, metadata: AuditLogMetadata = {}) {
    const { entityType = 'system', entityId, ...rest } = metadata;

    return this.prisma.auditLog.create({
      data: {
        userId,
        action: event,
        entityType,
        entityId,
        metadata: rest as Prisma.InputJsonObject,
      },
    });
  }
}
