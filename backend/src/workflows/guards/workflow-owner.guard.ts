import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedRequest } from '../../auth/types/authenticated-request';

@Injectable()
export class WorkflowOwnerGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const workflowId = request.params.id;

    if (!workflowId || Array.isArray(workflowId)) {
      throw new NotFoundException('Workflow not found');
    }

    if (!isUUID(workflowId)) {
      throw new BadRequestException('Invalid workflow ID format');
    }

    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
      select: { userId: true },
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    if (workflow.userId !== request.user.id) {
      throw new ForbiddenException('You do not own this workflow');
    }

    return true;
  }
}
