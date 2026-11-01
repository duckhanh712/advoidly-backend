import { DynamicModule, Global, Inject, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { buildAppConfig } from './app-config';
import { ServiceName } from './service-name';

export const APP_CONFIG = Symbol('APP_CONFIG');

/** Injects the typed `AppConfig` of the running service. */
export const InjectAppConfig = () => Inject(APP_CONFIG);

@Global()
@Module({})
export class AppConfigModule {
  static forService(serviceName: ServiceName): DynamicModule {
    return {
      module: AppConfigModule,
      imports: [
        // Loads `.env` from the repository root into process.env (existing variables win).
        ConfigModule.forRoot({ isGlobal: true, cache: true, envFilePath: ['.env'] }),
      ],
      providers: [{ provide: APP_CONFIG, useFactory: () => buildAppConfig(serviceName) }],
      exports: [APP_CONFIG],
    };
  }
}
