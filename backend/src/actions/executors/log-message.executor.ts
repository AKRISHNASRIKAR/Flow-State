import {
  ActionResult,
  IActionExecutor,
  StepLogger,
} from '../interfaces/action-executor.interface';

interface LogMessageConfig {
  message: string;
  level?: 'info' | 'warn' | 'error';
}

export class LogMessageExecutor implements IActionExecutor {
  constructor(private readonly logger: StepLogger) {}

  execute(config: Record<string, unknown>): Promise<ActionResult> {
    const { message, level = 'info' } = config as unknown as LogMessageConfig;

    if (level === 'error') {
      this.logger.error(message);
    } else if (level === 'warn') {
      this.logger.warn(message);
    } else {
      this.logger.log(message);
    }

    return Promise.resolve({
      success: true,
      response: { logged: message, level },
    });
  }
}
