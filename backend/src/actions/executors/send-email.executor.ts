import {
  ActionResult,
  ConfigReader,
  IActionExecutor,
} from '../interfaces/action-executor.interface';

const RESEND_TIMEOUT_MS = 10_000;

interface SendEmailConfig {
  to: string;
  subject: string;
  body: string;
  fromName?: string;
  fromAddress?: string;
}

export class SendEmailExecutor implements IActionExecutor {
  constructor(private readonly configService: ConfigReader) {}

  async execute(config: Record<string, unknown>): Promise<ActionResult> {
    const { to, subject, body, fromName, fromAddress } =
      config as unknown as SendEmailConfig;
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    const configuredFrom =
      fromAddress ||
      this.configService.get<string>('RESEND_FROM_ADDRESS') ||
      'noreply@example.com';

    if (!apiKey) {
      return { success: false, error: 'RESEND_API_KEY is not configured' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS);

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${fromName ?? 'FlowState'} <${configuredFrom}>`,
          to,
          subject,
          html: body,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorMsg = `Resend API error: ${response.status}`;
        try {
          const errorBody: unknown = await response.json();
          if (
            typeof errorBody === 'object' &&
            errorBody !== null &&
            'message' in errorBody &&
            typeof errorBody.message === 'string'
          ) {
            errorMsg += ` - ${errorBody.message}`;
          }
        } catch {
          // A non-JSON error body still leaves the status code in the message.
        }
        return {
          success: false,
          error: errorMsg,
        };
      }

      const result = (await response.json()) as { id?: string };
      return { success: true, response: { messageId: result.id } };
    } catch (error) {
      return {
        success: false,
        error: `Resend request failed: ${errorMessage(error)}`,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
