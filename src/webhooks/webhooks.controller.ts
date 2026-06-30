import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { WorkflowOwnerGuard } from '../workflows/guards/workflow-owner.guard';
import { WebhooksService } from './webhooks.service';

/**
 * Extend Express Request type to include rawBody.
 * main.ts populates this before JSON parsing for HMAC verification.
 */
interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

@ApiTags('Webhooks')
@Controller()
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  // ─── Public webhook ingress ──────────────────────────────────────────

  @Post('webhooks/:workflowId')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Receive webhook',
    description:
      'Public endpoint for external services (GitHub, Stripe, etc.) to trigger a workflow. ' +
      'If the trigger has a secret, the request must include an X-FlowForge-Signature header ' +
      'with format: sha256=<HMAC-SHA256 hex digest>.',
  })
  @ApiParam({ name: 'workflowId', description: 'Workflow ID (UUID)' })
  @ApiHeader({
    name: 'X-FlowForge-Signature',
    required: false,
    description: 'HMAC-SHA256 signature: sha256=<hex>',
  })
  @ApiBody({
    description: 'Arbitrary JSON payload from the external service',
    schema: {
      type: 'object',
      example: { event: 'push', ref: 'refs/heads/main' },
    },
  })
  @ApiResponse({ status: 200, description: 'Webhook received' })
  @ApiResponse({ status: 401, description: 'Invalid HMAC signature' })
  @ApiResponse({ status: 404, description: 'Workflow or trigger not found' })
  handleWebhook(
    @Param('workflowId') workflowId: string,
    @Req() req: RawBodyRequest,
    @Headers('x-flowforge-signature') signature: string | undefined,
    @Headers('x-idempotency-key') idempotencyKey: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    const rawBody = req.rawBody ?? Buffer.alloc(0);
    const parsedBody = this.parseRawJson(rawBody, body);

    return this.webhooksService.handleWebhook(
      workflowId,
      rawBody,
      signature,
      idempotencyKey,
      parsedBody,
    );
  }

  // ─── Authenticated: manual fire ──────────────────────────────────────

  @Post('workflows/:id/trigger/fire')
  @UseGuards(WorkflowOwnerGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Manually fire trigger',
    description:
      'Authenticated endpoint for testing. Skips HMAC verification and emits the same ' +
      '"workflow.triggered" event with source "manual".',
  })
  @ApiParam({ name: 'id', description: 'Workflow ID (UUID)' })
  @ApiBody({
    description: 'Test payload to send to the workflow',
    schema: { type: 'object', example: { test: true, data: 'hello' } },
  })
  @ApiResponse({ status: 200, description: 'Manual trigger fired' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — not the workflow owner',
  })
  @ApiResponse({ status: 404, description: 'Workflow or trigger not found' })
  manualFire(
    @Param('id') workflowId: string,
    @Body() body?: { payload?: Record<string, unknown> },
  ) {
    return this.webhooksService.manualFire(workflowId, body?.payload ?? {});
  }

  // ─── Authenticated: event history ────────────────────────────────────

  @Get('workflows/:id/webhook-events')
  @UseGuards(WorkflowOwnerGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List webhook events',
    description:
      'Paginated list of webhook events received for this workflow. Useful for debugging.',
  })
  @ApiParam({ name: 'id', description: 'Workflow ID (UUID)' })
  @ApiQuery({ name: 'page', required: false, example: 1, type: Number })
  @ApiQuery({ name: 'limit', required: false, example: 20, type: Number })
  @ApiQuery({
    name: 'status',
    required: false,
    example: 'RECEIVED',
    type: String,
  })
  @ApiResponse({ status: 200, description: 'Paginated event list' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — not the workflow owner',
  })
  listEvents(
    @Param('id') workflowId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
  ) {
    return this.webhooksService.listEvents(workflowId, page, limit, status);
  }

  private parseRawJson(
    rawBody: Buffer,
    parsedBody: Record<string, unknown> | undefined,
  ) {
    if (rawBody.length === 0) {
      return {};
    }

    try {
      return JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
    } catch {
      if (parsedBody && Object.keys(parsedBody).length > 0) {
        return parsedBody;
      }

      throw new BadRequestException('Invalid JSON payload');
    }
  }
}
