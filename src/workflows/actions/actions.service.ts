import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateActionDto } from '../dto/create-action.dto';
import { ReorderActionsDto } from '../dto/reorder-actions.dto';
import { UpdateActionDto } from '../dto/update-action.dto';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

@Injectable()
export class ActionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Add an action to a workflow. Position defaults to one past the current max.
   */
  async create(workflowId: string, dto: CreateActionDto) {
    // Auto-assign position if not provided
    let position = dto.order ?? 0;
    if (dto.order === undefined) {
      const lastAction = await this.prisma.action.findFirst({
        where: { workflowId },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      position = lastAction ? lastAction.position + 1 : 0;
    }

    const action = await this.prisma.action.create({
      data: {
        workflowId,
        type: dto.type,
        config: (dto.configuration ?? {}) as Prisma.InputJsonObject,
        position,
      },
    });

    return this.serialize(action);
  }

  /**
   * List all actions for a workflow, ordered by position ascending.
   */
  async list(workflowId: string) {
    const actions = await this.prisma.action.findMany({
      where: { workflowId },
      orderBy: { position: 'asc' },
    });

    return actions.map((a) => this.serialize(a));
  }

  /**
   * Update an action's type, configuration, or order.
   */
  async update(workflowId: string, actionId: string, dto: UpdateActionDto) {
    const action = await this.findOwnedAction(workflowId, actionId);

    const updated = await this.prisma.action.update({
      where: { id: action.id },
      data: {
        type: dto.type,
        config:
          dto.configuration !== undefined
            ? (dto.configuration as Prisma.InputJsonObject)
            : undefined,
        position: dto.order,
      },
    });

    return this.serialize(updated);
  }

  /**
   * Delete an action from a workflow.
   */
  async remove(workflowId: string, actionId: string) {
    await this.findOwnedAction(workflowId, actionId);

    await this.prisma.action.delete({ where: { id: actionId } });

    return { deleted: true };
  }

  /**
   * Reorder all actions in a workflow.
   * The caller provides all action IDs in the desired order.
   * Each action's position is set to its index in the array.
   */
  async reorder(workflowId: string, dto: ReorderActionsDto) {
    // Verify all provided IDs belong to this workflow
    const existing = await this.prisma.action.findMany({
      where: { workflowId },
      select: { id: true },
    });

    const existingIds = new Set(existing.map((a) => a.id));
    const providedIds = new Set(dto.orderedIds);

    // Check for IDs that don't belong to this workflow
    for (const id of dto.orderedIds) {
      if (!existingIds.has(id)) {
        throw new BadRequestException(
          `Action ${id} does not belong to this workflow`,
        );
      }
    }

    // Check that all existing actions are accounted for
    if (providedIds.size !== existingIds.size) {
      throw new BadRequestException(
        `Expected ${existingIds.size} action IDs, received ${providedIds.size}. ` +
          `All actions must be included in the reorder.`,
      );
    }

    // Update each action's position in a transaction
    await this.prisma.$transaction(
      dto.orderedIds.map((id, index) =>
        this.prisma.action.update({
          where: { id },
          data: { position: index },
        }),
      ),
    );

    // Return the newly ordered list
    return this.list(workflowId);
  }

  /**
   * Find an action that belongs to the given workflow.
   * Throws 404 if the action doesn't exist or doesn't belong to the workflow.
   */
  private async findOwnedAction(workflowId: string, actionId: string) {
    const action = await this.prisma.action.findFirst({
      where: { id: actionId, workflowId },
    });

    if (!action) {
      throw new NotFoundException('Action not found in this workflow');
    }

    return action;
  }

  private serialize(action: {
    id: string;
    workflowId: string;
    type: string;
    config: unknown;
    position: number;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: action.id,
      workflowId: action.workflowId,
      type: action.type,
      configuration: action.config,
      order: action.position,
      createdAt: action.createdAt,
      updatedAt: action.updatedAt,
    };
  }
}
