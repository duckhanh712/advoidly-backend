import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

/**
 * JSON cache on top of Redis. Cache failures are logged and treated as misses so that
 * Redis is never a hard dependency for reads.
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async getJson<T>(key: string): Promise<T | undefined> {
    try {
      const value = await this.redis.get(key);
      return value ? (JSON.parse(value) as T) : undefined;
    } catch (error) {
      this.logger.warn(`Cache read failed for ${key}: ${(error as Error).message}`);
      return undefined;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) return;
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error) {
      this.logger.warn(`Cache write failed for ${key}: ${(error as Error).message}`);
    }
  }

  async delete(...keys: string[]): Promise<void> {
    try {
      await this.redis.del(...keys);
    } catch (error) {
      this.logger.warn(`Cache delete failed: ${(error as Error).message}`);
    }
  }
}
