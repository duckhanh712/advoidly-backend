import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { APP_CONFIG, AppConfig } from '@app/config';
import { buildHttpLoggerOptions } from './http-logger.options';

/** Structured JSON logging (pino) with correlation ids and secret redaction. */
@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({ pinoHttp: buildHttpLoggerOptions(config) }),
    }),
  ],
  exports: [LoggerModule],
})
export class ObservabilityModule {}
