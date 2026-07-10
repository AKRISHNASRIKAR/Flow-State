import {
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
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
import { ExecutionsService } from './executions.service';

@ApiTags('Executions')
@ApiBearerAuth()
@Controller('executions')
export class ExecutionsController {
  constructor(private readonly executionsService: ExecutionsService) {}

  @Get()
  @ApiOperation({
    summary: 'List executions',
    description:
      "Paginated list of workflow executions scoped to the current user's workflows.",
  })
  @ApiQuery({ name: 'page', required: false, example: 1, type: Number })
  @ApiQuery({ name: 'limit', required: false, example: 20, type: Number })
  @ApiQuery({ name: 'status', required: false, example: 'SUCCEEDED' })
  @ApiQuery({ name: 'workflowId', required: false })
  @ApiResponse({ status: 200, description: 'Paginated execution list' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  list(
    @CurrentUser('id') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Query('workflowId') workflowId?: string,
  ) {
    return this.executionsService.list(userId, page, limit, status, workflowId);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Execution statistics',
    description:
      'Aggregate execution counts, average duration, DLQ depth, and rate limit usage for the current user.',
  })
  @ApiResponse({ status: 200, description: 'Execution statistics' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  stats(@CurrentUser('id') userId: string) {
    return this.executionsService.stats(userId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get execution detail',
    description:
      'Returns a single execution with its full action_executions history.',
  })
  @ApiParam({ name: 'id', description: 'Execution ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Execution found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Execution not found' })
  getOne(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.executionsService.getOne(userId, id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel a pending execution',
    description:
      'Cancels an execution that has not started yet. Only works while status is PENDING.',
  })
  @ApiParam({ name: 'id', description: 'Execution ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Execution cancelled' })
  @ApiResponse({
    status: 400,
    description: 'Execution is not in a cancellable state',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Execution not found' })
  cancel(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.executionsService.cancel(userId, id);
  }
}
