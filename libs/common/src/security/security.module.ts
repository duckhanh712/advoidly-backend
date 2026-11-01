import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { APP_CONFIG, AppConfig } from '@app/config';
import { InternalApiKeyGuard, JwtAuthGuard, RolesGuard } from '../guards';

/**
 * Registers JWT verification and the global auth guards. Every route requires a valid
 * access token unless marked `@Public()`; `@Roles()` adds role checks.
 */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        secret: config.jwt.accessSecret,
        signOptions: {
          expiresIn: config.jwt.accessTtlSeconds,
          issuer: config.jwt.issuer,
          audience: config.jwt.audience,
          algorithm: 'HS256',
        },
        verifyOptions: {
          issuer: config.jwt.issuer,
          audience: config.jwt.audience,
          algorithms: ['HS256'],
        },
      }),
    }),
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    InternalApiKeyGuard,
  ],
  exports: [JwtModule, InternalApiKeyGuard],
})
export class SecurityModule {}
