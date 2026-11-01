import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AppConfig, InjectAppConfig } from '@app/config';

/**
 * Prisma client bound to the running service's own database role.
 *
 * All services share one generated client (one `schema.prisma`), but each connects with
 * a PostgreSQL role that only has privileges on its own schema, so cross-service table
 * access fails at the database level. See docs/database/database-design.md.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(@InjectAppConfig() config: AppConfig) {
    super({
      datasourceUrl: config.databaseUrl,
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    // Connect lazily: the service still boots (and reports unhealthy) if the DB is down.
    this.$connect().catch((error: unknown) =>
      this.logger.error({ err: error }, 'Initial database connection failed'),
    );
  }

  async onModuleDestroy(): Promise<void> {
    // $disconnect rethrows a pending connection error; shutdown must not fail because of it.
    await this.$disconnect().catch(() => undefined);
  }
}
