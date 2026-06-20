import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, Prisma, Workflow, WorkflowStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../shared/audit-log.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

@Injectable()
export class WorkflowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async create(userId: string, dto: CreateWorkflowDto) {
    const workflow = await this.prisma.workflow.create({
      data: {
        userId,
        name: dto.name,
        description: dto.description,
        status: this.enabledToStatus(dto.enabled ?? true),
      },
    });

    await this.auditLog.log(userId, AuditAction.CREATE, {
      entityType: 'workflows',
      entityId: workflow.id,
      event: 'workflow.created',
      workflowId: workflow.id,
    });

    return this.serializeWorkflow(workflow);
  }

  async list(userId: string, page = DEFAULT_PAGE, limit = DEFAULT_LIMIT) {
    const safePage = Math.max(DEFAULT_PAGE, page);
    const safeLimit = Math.min(Math.max(1, limit), MAX_LIMIT);
    const skip = (safePage - 1) * safeLimit;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.workflow.findMany({
        where: {
          userId,
          status: { not: WorkflowStatus.ARCHIVED },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
      }),
      this.prisma.workflow.count({
        where: {
          userId,
          status: { not: WorkflowStatus.ARCHIVED },
        },
      }),
    ]);

    return {
      data: items.map((workflow) => this.serializeWorkflow(workflow)),
      meta: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  async getOne(userId: string, id: string) {
    const workflow = await this.findVisibleOwnedWorkflow(userId, id);
    return this.serializeWorkflow(workflow);
  }

  async update(userId: string, id: string, dto: UpdateWorkflowDto) {
    await this.findVisibleOwnedWorkflow(userId, id);

    const workflow = await this.prisma.workflow.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        status:
          dto.enabled === undefined
            ? undefined
            : this.enabledToStatus(dto.enabled),
      },
    });

    return this.serializeWorkflow(workflow);
  }

  async remove(userId: string, id: string) {
    await this.findVisibleOwnedWorkflow(userId, id);

    const workflow = await this.prisma.workflow.update({
      where: { id },
      data: { status: WorkflowStatus.ARCHIVED },
    });

    await this.auditLog.log(userId, AuditAction.DELETE, {
      entityType: 'workflows',
      entityId: workflow.id,
      event: 'workflow.deleted',
      workflowId: workflow.id,
      deleteType: 'soft',
    });

    return this.serializeWorkflow(workflow);
  }

  async pause(userId: string, id: string) {
    await this.findVisibleOwnedWorkflow(userId, id);

    const workflow = await this.prisma.workflow.update({
      where: { id },
      data: { status: WorkflowStatus.PAUSED },
    });

    return this.serializeWorkflow(workflow);
  }

  async resume(userId: string, id: string) {
    await this.findVisibleOwnedWorkflow(userId, id);

    const workflow = await this.prisma.workflow.update({
      where: { id },
      data: { status: WorkflowStatus.ACTIVE },
    });

    return this.serializeWorkflow(workflow);
  }

  async clone(userId: string, id: string) {
    const source = await this.prisma.workflow.findFirst({
      where: { id, userId },
      include: {
        triggers: true,
        conditions: true,
        actions: true,
      },
    });

    if (!source || source.status === WorkflowStatus.ARCHIVED) {
      throw new NotFoundException('Workflow not found');
    }

    const workflow = await this.prisma.workflow.create({
      data: {
        userId,
        name: `Copy of ${source.name}`,
        description: source.description,
        status: source.status,
        version: 1,
        triggers: {
          create: source.triggers.map((trigger) => ({
            type: trigger.type,
            config: trigger.config as Prisma.InputJsonValue,
            enabled: trigger.enabled,
          })),
        },
        conditions: {
          create: source.conditions.map((condition) => ({
            type: condition.type,
            expression: condition.expression as Prisma.InputJsonValue,
            position: condition.position,
          })),
        },
        actions: {
          create: source.actions.map((action) => ({
            type: action.type,
            config: action.config as Prisma.InputJsonValue,
            position: action.position,
          })),
        },
      },
    });

    await this.auditLog.log(userId, AuditAction.CREATE, {
      entityType: 'workflows',
      entityId: workflow.id,
      event: 'workflow.cloned',
      workflowId: workflow.id,
      sourceWorkflowId: source.id,
    });

    return this.serializeWorkflow(workflow);
  }

  private async findVisibleOwnedWorkflow(userId: string, id: string) {
    const workflow = await this.prisma.workflow.findFirst({
      where: {
        id,
        userId,
        status: { not: WorkflowStatus.ARCHIVED },
      },
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    return workflow;
  }

  private enabledToStatus(enabled: boolean) {
    return enabled ? WorkflowStatus.ACTIVE : WorkflowStatus.PAUSED;
  }

  private serializeWorkflow(workflow: Workflow) {
    return {
      id: workflow.id,
      userId: workflow.userId,
      name: workflow.name,
      description: workflow.description,
      enabled: workflow.status === WorkflowStatus.ACTIVE,
      status: workflow.status,
      version: workflow.version,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
    };
  }
}
