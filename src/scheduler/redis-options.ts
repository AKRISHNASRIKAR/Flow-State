import { ConfigService } from '@nestjs/config';
import type { RedisOptions } from 'ioredis';

export function getRedisConnectionOptions(config: ConfigService): RedisOptions {
  const redisUrl = config.get<string>('REDIS_URL');

  if (redisUrl) {
    const url = new URL(redisUrl);

    return {
      host: url.hostname,
      port: url.port ? Number(url.port) : 6379,
      username: url.username || undefined,
      password: url.password || undefined,
      db: url.pathname ? Number(url.pathname.slice(1) || 0) : 0,
      maxRetriesPerRequest: null,
    };
  }

  return {
    host: config.get<string>('REDIS_HOST', 'localhost'),
    port: config.get<number>('REDIS_PORT', 6379),
    password: config.get<string>('REDIS_PASSWORD') || undefined,
    db: config.get<number>('REDIS_DB', 0),
    maxRetriesPerRequest: null,
  };
}
