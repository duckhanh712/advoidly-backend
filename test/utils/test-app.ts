import { Global, INestApplication, Module, ModuleMetadata } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { inject, InjectOptions, Response } from 'light-my-request';
import { randomUUID } from 'node:crypto';
import { configureHttpApp, correlationIdMiddleware, SecurityModule } from '@app/common';
import { APP_CONFIG, AppConfig, buildAppConfig, ServiceName } from '@app/config';
import { UserRole } from '@app/contracts';

export const TEST_ENV = {
  JWT_ACCESS_SECRET: 'test-only-access-secret-0123456789abcdef',
  INTERNAL_API_KEY: 'test-only-internal-key',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  LOG_LEVEL: 'silent',
};

export const testConfig = (service: ServiceName): AppConfig => buildAppConfig(service, TEST_ENV);

export interface TestApp {
  app: INestApplication;
  jwt: JwtService;
  config: AppConfig;
  /** In-process HTTP request (no socket), through the full Express + Nest pipeline. */
  request(options: InjectOptions): Promise<Response>;
  close(): Promise<void>;
}

/**
 * Boots a Nest app with the same HTTP conventions as production (prefix, versioning,
 * validation, error filter, envelope, JWT + role guards) around the given controllers.
 */
export async function createTestApp(
  service: ServiceName,
  metadata: ModuleMetadata,
): Promise<TestApp> {
  const config = testConfig(service);

  @Global()
  @Module({ providers: [{ provide: APP_CONFIG, useValue: config }], exports: [APP_CONFIG] })
  class TestConfigModule {}

  const moduleRef = await Test.createTestingModule({
    imports: [TestConfigModule, SecurityModule, ...(metadata.imports ?? [])],
    controllers: metadata.controllers,
    providers: metadata.providers,
  }).compile();

  const app = moduleRef.createNestApplication({ logger: false });
  app.use(correlationIdMiddleware);
  configureHttpApp(app, config);
  await app.init();
  const handler = app.getHttpAdapter().getInstance();

  return {
    app,
    config,
    jwt: moduleRef.get(JwtService),
    request: (options) => inject(handler, options),
    close: () => app.close(),
  };
}

export function bearer(
  jwt: JwtService,
  role: UserRole,
  id: string = randomUUID(),
): Record<string, string> {
  const token = jwt.sign({ sub: id, email: `${role.toLowerCase()}@example.com`, role });
  return { authorization: `Bearer ${token}` };
}
