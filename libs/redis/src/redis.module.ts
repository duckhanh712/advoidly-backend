import { Global, Inject, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import Redis from 'ioredis';
import { APP_CONFIG, AppConfig } from '@app/config';
import { CacheService } from './cache.service';
import { REDIS_CLIENT } from './redis.constants';
import { RedisHealthIndicator } from './redis.health';

@Global()
@Module({
  imports: [TerminusModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => {
        const logger = new Logger('Redis');
        const client = new Redis(config.redisUrl, {
          keyPrefix: 'uap:',
          maxRetriesPerRequest: 2,
          enableOfflineQueue: false,
          lazyConnect: false,
        });
        client.on('error', (error) => logger.warn(`Redis error: ${error.message}`));
        return client;
      },
    },
    CacheService,
    RedisHealthIndicator,
  ],
  exports: [REDIS_CLIENT, CacheService, RedisHealthIndicator],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.client.quit().catch(() => this.client.disconnect());
  }
}
