import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { interpolateConfig } from '../common/utils/template.util';
import { DelayExecutor } from './executors/delay.executor';
import { HttpRequestExecutor } from './executors/http-request.executor';
import { LogMessageExecutor } from './executors/log-message.executor';
import { SendEmailExecutor } from './executors/send-email.executor';
import { TelegramNotifyExecutor } from './executors/telegram-notify.executor';
import {
  ActionResult,
  ExecutionContext,
  IActionExecutor,
} from './interfaces/action-executor.interface';

/**
 * Strategy pattern registry: every action type maps to one executor.
 * Adding a new action touches two places — a new executor class and one
 * line here — instead of a growing switch statement in the processor.
 */
@Injectable()
export class ActionExecutorService {
  private readonly logger = new Logger(ActionExecutorService.name);
  private readonly registry: Map<string, IActionExecutor>;

  constructor(configService: ConfigService) {
    this.registry = new Map<string, IActionExecutor>([
      ['SEND_EMAIL', new SendEmailExecutor(configService)],
      ['HTTP_REQUEST', new HttpRequestExecutor()],
      ['LOG_MESSAGE', new LogMessageExecutor()],
      ['DELAY', new DelayExecutor()],
      ['TELEGRAM_NOTIFY', new TelegramNotifyExecutor(configService)],
    ]);
  }

  async execute(
    type: string,
    config: Record<string, unknown>,
    payload: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<ActionResult> {
    const executor = this.registry.get(type);

    if (!executor) {
      return { success: false, error: `Unknown action type: ${type}` };
    }

    const interpolatedConfig = interpolateConfig(config, payload);

    try {
      return await executor.execute(interpolatedConfig, payload, context);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Action ${type} threw: ${message}`);
      return { success: false, error: message };
    }
  }
}
