import { interpolateConfig } from '../common/utils/template.util';
import { DelayExecutor } from './executors/delay.executor';
import { HttpRequestExecutor } from './executors/http-request.executor';
import { LogMessageExecutor } from './executors/log-message.executor';
import { SendEmailExecutor } from './executors/send-email.executor';
import { TelegramNotifyExecutor } from './executors/telegram-notify.executor';
import {
  ActionResult,
  ConfigReader,
  ExecutionContext,
  IActionExecutor,
  StepLogger,
} from './interfaces/action-executor.interface';

/**
 * Strategy registry: every action type maps to one executor. Adding a new
 * action touches two places — a new executor class and one line here —
 * instead of a growing switch in the engine. Framework-free on purpose: the
 * NestJS ActionExecutorService and the Cloudflare workflow both build it.
 */
export function createExecutorRegistry(
  config: ConfigReader,
  logger: StepLogger,
): Map<string, IActionExecutor> {
  return new Map<string, IActionExecutor>([
    ['SEND_EMAIL', new SendEmailExecutor(config)],
    ['HTTP_REQUEST', new HttpRequestExecutor()],
    ['LOG_MESSAGE', new LogMessageExecutor(logger)],
    ['DELAY', new DelayExecutor()],
    ['TELEGRAM_NOTIFY', new TelegramNotifyExecutor(config)],
  ]);
}

/**
 * Interpolates {{payload.x}} templates centrally, then runs the executor.
 * Never throws: an executor that throws anyway is turned into a failed
 * ActionResult, so the engine only ever deals with results.
 */
export async function runAction(
  registry: Map<string, IActionExecutor>,
  type: string,
  config: Record<string, unknown>,
  payload: Record<string, unknown>,
  context: ExecutionContext,
): Promise<ActionResult> {
  const executor = registry.get(type);
  if (!executor) {
    return { success: false, error: `Unknown action type: ${type}` };
  }

  try {
    return await executor.execute(
      interpolateConfig(config, payload),
      payload,
      context,
    );
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
