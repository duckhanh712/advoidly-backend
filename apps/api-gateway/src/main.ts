import { bootstrapService } from '@app/common';
import { AppModule } from './app.module';
import { configureGateway } from './gateway.setup';
import { PROXY_ROUTES } from './proxy/routes';

void bootstrapService(AppModule, {
  title: 'Urban Alert Platform API',
  description:
    'Public entry point. Routes /api/v1/* to the owning services. ' +
    'Use the selector (top right) to browse each service’s endpoints.',
  // Bodies are streamed to upstream services untouched; they validate their own DTOs.
  bodyParser: false,
  configure: configureGateway,
  excludeFromPrefix: ['openapi/*path'],
  swaggerUrls: () => PROXY_ROUTES.map((r) => ({ name: r.service, url: `/openapi/${r.service}` })),
});
