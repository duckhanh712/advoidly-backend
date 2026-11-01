import { INestApplication, Type, VersioningType } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { APP_CONFIG, AppConfig } from '@app/config';
import { AllExceptionsFilter } from '../filters';
import { ResponseEnvelopeInterceptor } from '../interceptors';
import { correlationIdMiddleware } from '../middleware';
import { createValidationPipe } from '../pipes';

export const API_PREFIX = 'api';

export interface BootstrapOptions {
  title: string;
  description: string;
  /** Disable for the gateway so request bodies are streamed to upstream services untouched. */
  bodyParser?: boolean;
  /** Hook to register extra middleware before the app starts listening. */
  configure?: (app: NestExpressApplication, config: AppConfig) => void | Promise<void>;
  /** Extra route patterns served outside `/api/v1` (health and internal are always excluded). */
  excludeFromPrefix?: string[];
  /** Additional OpenAPI documents listed in the Swagger UI selector (gateway aggregation). */
  swaggerUrls?: (config: AppConfig) => { name: string; url: string }[];
}

/** Applies the conventions shared by every HTTP service (prefix, versioning, errors, docs). */
export function configureHttpApp(
  app: INestApplication,
  config: AppConfig,
  excludeFromPrefix: string[] = [],
): void {
  app.setGlobalPrefix(API_PREFIX, {
    exclude: ['health', 'health/*path', 'internal/*path', ...excludeFromPrefix],
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor(app.get(Reflector)));
  app.enableCors({
    origin: config.http.corsOrigins.includes('*') ? true : config.http.corsOrigins,
    exposedHeaders: ['x-correlation-id'],
  });
  app.enableShutdownHooks();
}

export function setupSwagger(
  app: INestApplication,
  options: BootstrapOptions,
  config: AppConfig,
): void {
  if (!config.http.swaggerEnabled) return;
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle(options.title)
      .setDescription(options.description)
      .setVersion('1.0')
      .addBearerAuth()
      .build(),
  );
  const extraUrls = options.swaggerUrls?.(config) ?? [];
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs-json',
    ...(extraUrls.length > 0
      ? {
          explorer: true,
          swaggerOptions: { urls: [{ name: config.serviceName, url: '/docs-json' }, ...extraUrls] },
        }
      : {}),
  });
}

export async function bootstrapService(
  module: Type<unknown>,
  options: BootstrapOptions,
): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(module, {
    bufferLogs: true,
    bodyParser: options.bodyParser ?? true,
  });
  const config = app.get<AppConfig>(APP_CONFIG);
  const logger = app.get(Logger);
  app.useLogger(logger);
  app.disable('x-powered-by');
  app.use(correlationIdMiddleware);

  await options.configure?.(app, config);
  configureHttpApp(app, config, options.excludeFromPrefix);
  setupSwagger(app, options, config);

  await app.listen(config.port);
  logger.log(`${config.serviceName} listening on port ${config.port}`, 'Bootstrap');
}
