import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { WorkflowOwnerGuard } from './guards/workflow-owner.guard';
import { WorkflowsService } from './workflows.service';

@ApiTags('Workflows')
@ApiBearerAuth()
@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a workflow',
    description: 'Creates a new workflow owned by the authenticated user.',
  })
  @ApiResponse({
    status: 201,
    description: 'Workflow created successfully',
    schema: {
      example: {
        id: 'clx1abc23def0000ghi1jklm',
        name: 'Daily Sync Pipeline',
        description: 'Syncs data nightly',
        enabled: false,
        userId: 'clx1user0000',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreateWorkflowDto) {
    return this.workflowsService.create(userId, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List workflows',
    description:
      'Returns a paginated list of all workflows owned by the authenticated user.',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number (default: 1)',
    example: 1,
    type: Number,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of results per page (default: 20)',
    example: 20,
    type: Number,
  })
  @ApiResponse({ status: 200, description: 'Paginated workflow list' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  list(
    @CurrentUser('id') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.workflowsService.list(userId, page, limit);
  }

  @Get(':id')
  @UseGuards(WorkflowOwnerGuard)
  @ApiOperation({
    summary: 'Get a workflow by ID',
    description:
      'Returns the full details of a single workflow. The authenticated user must be the owner.',
  })
  @ApiParam({
    name: 'id',
    description: 'Workflow ID (CUID)',
    example: 'clx1abc23def0000ghi1jklm',
  })
  @ApiResponse({ status: 200, description: 'Workflow found' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — not the workflow owner',
  })
  @ApiResponse({ status: 404, description: 'Workflow not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getOne(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.workflowsService.getOne(userId, id);
  }

  @Patch(':id')
  @UseGuards(WorkflowOwnerGuard)
  @ApiOperation({
    summary: 'Update a workflow',
    description:
      'Partially updates a workflow. All fields are optional. The authenticated user must be the owner.',
  })
  @ApiParam({
    name: 'id',
    description: 'Workflow ID',
    example: 'clx1abc23def0000ghi1jklm',
  })
  @ApiResponse({ status: 200, description: 'Workflow updated successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — not the workflow owner',
  })
  @ApiResponse({ status: 404, description: 'Workflow not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateWorkflowDto,
  ) {
    return this.workflowsService.update(userId, id, dto);
  }

  @Delete(':id')
  @UseGuards(WorkflowOwnerGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a workflow',
    description:
      'Permanently deletes a workflow. The authenticated user must be the owner.',
  })
  @ApiParam({
    name: 'id',
    description: 'Workflow ID',
    example: 'clx1abc23def0000ghi1jklm',
  })
  @ApiResponse({ status: 200, description: 'Workflow deleted successfully' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — not the workflow owner',
  })
  @ApiResponse({ status: 404, description: 'Workflow not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  remove(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.workflowsService.remove(userId, id);
  }

  @Post(':id/pause')
  @UseGuards(WorkflowOwnerGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Pause a workflow',
    description:
      'Disables a workflow so it no longer runs. The authenticated user must be the owner.',
  })
  @ApiParam({
    name: 'id',
    description: 'Workflow ID',
    example: 'clx1abc23def0000ghi1jklm',
  })
  @ApiResponse({ status: 200, description: 'Workflow paused' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — not the workflow owner',
  })
  @ApiResponse({ status: 404, description: 'Workflow not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  pause(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.workflowsService.pause(userId, id);
  }

  @Post(':id/resume')
  @UseGuards(WorkflowOwnerGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resume a workflow',
    description:
      'Re-enables a previously paused workflow. The authenticated user must be the owner.',
  })
  @ApiParam({
    name: 'id',
    description: 'Workflow ID',
    example: 'clx1abc23def0000ghi1jklm',
  })
  @ApiResponse({ status: 200, description: 'Workflow resumed' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — not the workflow owner',
  })
  @ApiResponse({ status: 404, description: 'Workflow not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  resume(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.workflowsService.resume(userId, id);
  }

  @Get(':id/poll-history')
  @UseGuards(WorkflowOwnerGuard)
  @ApiOperation({
    summary: 'List polling history',
    description:
      'Returns the last 50 polling events for this workflow trigger for debugging.',
  })
  @ApiParam({
    name: 'id',
    description: 'Workflow ID',
    example: 'clx1abc23def0000ghi1jklm',
  })
  @ApiResponse({ status: 200, description: 'Polling history list' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — not the workflow owner',
  })
  @ApiResponse({ status: 404, description: 'Workflow not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  pollHistory(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.workflowsService.pollHistory(userId, id);
  }

  @Post(':id/clone')
  @UseGuards(WorkflowOwnerGuard)
  @ApiOperation({
    summary: 'Clone a workflow',
    description:
      'Creates a copy of an existing workflow. The clone is owned by the authenticated user.',
  })
  @ApiParam({
    name: 'id',
    description: 'Workflow ID to clone',
    example: 'clx1abc23def0000ghi1jklm',
  })
  @ApiResponse({ status: 201, description: 'Workflow cloned successfully' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — not the workflow owner',
  })
  @ApiResponse({ status: 404, description: 'Workflow not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  clone(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.workflowsService.clone(userId, id);
  }
}
