import type { ConfigReader } from '../../backend/src/actions/interfaces/action-executor.interface';

/**
 * Secrets, set with `wrangler secret put NAME` (or .dev.vars locally). They
 * aren't declared in wrangler.jsonc, so `wrangler types` can't see them —
 * listed here instead. Bindings and plain vars come from the generated
 * Cloudflare.Env.
 */
interface Secrets {
  JWT_ACCESS_SECRET: string;
  JWT_REFRESH_SECRET: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  CREDENTIALS_ENCRYPTION_KEY?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_ADDRESS?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  ADMIN_SECRET?: string;
}

export type Env = Cloudflare.Env & Secrets;

/**
 * Lets the shared executors (backend/src/actions) read settings from the
 * Worker env the way they read NestJS's ConfigService. Empty strings count
 * as unset, matching how the executors treat a blank .env value.
 */
export function configReader(env: Env): ConfigReader {
  const values = env as unknown as Record<string, unknown>;
  return {
    get<T>(key: string): T | undefined {
      const value = values[key];
      return typeof value === 'string' && value !== '' ? (value as T) : undefined;
    },
  };
}
