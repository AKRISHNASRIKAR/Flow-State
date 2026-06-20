import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { WorkflowOwnerGuard } from './guards/workflow-owner.guard';
import { WorkflowsService } from './workflows.service';

@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  @Post()
  create(@CurrentUser('id') userId: string, @Body() dto: CreateWorkflowDto) {
    return this.workflowsService.create(userId, dto);
  }

  @Get()
  list(
    @CurrentUser('id') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.workflowsService.list(userId, page, limit);
  }

  @Get(':id')
  @UseGuards(WorkflowOwnerGuard)
  getOne(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.workflowsService.getOne(userId, id);
  }

  @Patch(':id')
  @UseGuards(WorkflowOwnerGuard)
  update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateWorkflowDto,
  ) {
    return this.workflowsService.update(userId, id, dto);
  }

  @Delete(':id')
  @UseGuards(WorkflowOwnerGuard)
  remove(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.workflowsService.remove(userId, id);
  }

  @Post(':id/pause')
  @UseGuards(WorkflowOwnerGuard)
  pause(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.workflowsService.pause(userId, id);
  }

  @Post(':id/resume')
  @UseGuards(WorkflowOwnerGuard)
  resume(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.workflowsService.resume(userId, id);
  }

  @Post(':id/clone')
  @UseGuards(WorkflowOwnerGuard)
  clone(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.workflowsService.clone(userId, id);
  }
}
