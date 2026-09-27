import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ActionResult,
  ExecutionContext,
  IActionExecutor,
} from './interfaces/action-executor.interface';
import { createExecutorRegistry, runAction } from './run-action';

/** NestJS wrapper around the shared registry in run-action.ts. */
@Injectable()
export class ActionExecutorService {
  private readonly logger = new Logger(ActionExecutorService.name);
  private readonly registry: Map<string, IActionExecutor>;

  constructor(configService: ConfigService) {
    this.registry = createExecutorRegistry(
      configService,
      new Logger('WorkflowAction:LOG_MESSAGE'),
    );
  }

  async execute(
    type: string,
    config: Record<string, unknown>,
    payload: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<ActionResult> {
    const result = await runAction(
      this.registry,
      type,
      config,
      payload,
      context,
    );
    if (!result.success) {
      this.logger.error(`Action ${type} failed: ${result.error}`);
    }
    return result;
  }
}
