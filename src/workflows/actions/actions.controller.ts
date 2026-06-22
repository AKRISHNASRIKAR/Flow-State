import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { WorkflowOwnerGuard } from '../guards/workflow-owner.guard';
import { CreateActionDto } from '../dto/create-action.dto';
import { ReorderActionsDto } from '../dto/reorder-actions.dto';
import { UpdateActionDto } from '../dto/update-action.dto';
import { ActionsService } from './actions.service';

@ApiTags('Actions')
@ApiBearerAuth()
@Controller('workflows/:id/actions')
@UseGuards(WorkflowOwnerGuard)
export class ActionsController {
  constructor(private readonly actionsService: ActionsService) {}

  @Post()
  @ApiOperation({
    summary: 'Add an action to a workflow',
    description:
      'Creates a new action step in the workflow. If order is not provided, it is appended to the end.',
  })
  @ApiParam({ name: 'id', description: 'Workflow ID (UUID)' })
  @ApiResponse({ status: 201, description: 'Action created' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — not the workflow owner' })
  @ApiResponse({ status: 404, description: 'Workflow not found' })
  create(
    @Param('id') workflowId: string,
    @Body() dto: CreateActionDto,
  ) {
    return this.actionsService.create(workflowId, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List actions for a workflow',
    description: 'Returns all actions ordered by their execution order (position ascending).',
  })
  @ApiParam({ name: 'id', description: 'Workflow ID (UUID)' })
  @ApiResponse({ status: 200, description: 'List of actions' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — not the workflow owner' })
  list(@Param('id') workflowId: string) {
    return this.actionsService.list(workflowId);
  }

  @Patch(':aid')
  @ApiOperation({
    summary: 'Update an action',
    description: 'Partially updates an action. All fields are optional.',
  })
  @ApiParam({ name: 'id', description: 'Workflow ID (UUID)' })
  @ApiParam({ name: 'aid', description: 'Action ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Action updated' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — not the workflow owner' })
  @ApiResponse({ status: 404, description: 'Action not found' })
  update(
    @Param('id') workflowId: string,
    @Param('aid') actionId: string,
    @Body() dto: UpdateActionDto,
  ) {
    return this.actionsService.update(workflowId, actionId, dto);
  }

  @Delete(':aid')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete an action',
    description: 'Permanently removes an action from the workflow.',
  })
  @ApiParam({ name: 'id', description: 'Workflow ID (UUID)' })
  @ApiParam({ name: 'aid', description: 'Action ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Action deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — not the workflow owner' })
  @ApiResponse({ status: 404, description: 'Action not found' })
  remove(
    @Param('id') workflowId: string,
    @Param('aid') actionId: string,
  ) {
    return this.actionsService.remove(workflowId, actionId);
  }

  @Post('reorder')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reorder actions',
    description:
      'Sets the execution order of all actions. Pass all action IDs in the desired order. ' +
      'Every action in the workflow must be included.',
  })
  @ApiParam({ name: 'id', description: 'Workflow ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Actions reordered' })
  @ApiResponse({ status: 400, description: 'Invalid IDs or missing actions' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — not the workflow owner' })
  reorder(
    @Param('id') workflowId: string,
    @Body() dto: ReorderActionsDto,
  ) {
    return this.actionsService.reorder(workflowId, dto);
  }
}
