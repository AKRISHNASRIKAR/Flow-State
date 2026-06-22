import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { WorkflowOwnerGuard } from '../workflows/guards/workflow-owner.guard';
import { CreateTriggerDto } from './dto/create-trigger.dto';
import { TriggersService } from './triggers.service';

@ApiTags('Triggers')
@ApiBearerAuth()
@Controller('workflows/:id/trigger')
export class TriggersController {
  constructor(private readonly triggersService: TriggersService) {}

  @Post()
  @UseGuards(WorkflowOwnerGuard)
  @ApiOperation({
    summary: 'Create or update trigger',
    description:
      'Creates or upserts the single trigger for this workflow. ' +
      'If type is WEBHOOK, a secret is auto-generated for HMAC-SHA256 verification.',
  })
  @ApiParam({ name: 'id', description: 'Workflow ID (UUID)' })
  @ApiResponse({ status: 201, description: 'Trigger created/updated' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — not the workflow owner' })
  @ApiResponse({ status: 404, description: 'Workflow not found' })
  upsert(@Param('id') workflowId: string, @Body() dto: CreateTriggerDto) {
    return this.triggersService.upsert(workflowId, dto);
  }

  @Get()
  @UseGuards(WorkflowOwnerGuard)
  @ApiOperation({
    summary: 'Get trigger configuration',
    description: 'Returns the trigger config for this workflow. The secret is masked (first 8 chars only).',
  })
  @ApiParam({ name: 'id', description: 'Workflow ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Trigger found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — not the workflow owner' })
  @ApiResponse({ status: 404, description: 'Trigger not found' })
  findOne(@Param('id') workflowId: string) {
    return this.triggersService.findOne(workflowId);
  }

  @Delete()
  @UseGuards(WorkflowOwnerGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete trigger',
    description: 'Removes the trigger for this workflow.',
  })
  @ApiParam({ name: 'id', description: 'Workflow ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Trigger deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — not the workflow owner' })
  @ApiResponse({ status: 404, description: 'Trigger not found' })
  remove(@Param('id') workflowId: string) {
    return this.triggersService.remove(workflowId);
  }
}
