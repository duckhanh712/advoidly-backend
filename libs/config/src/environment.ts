import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

const toBool = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? ['true', '1', 'yes'].includes(value.toLowerCase()) : value;
const toInt = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() !== '' ? Number(value) : value;

/**
 * Shared environment variables. Service-specific variables (`<PREFIX>_PORT`,
 * `<PREFIX>_DATABASE_URL`) are resolved separately in `buildAppConfig`.
 */
export class EnvironmentVariables {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV: 'development' | 'test' | 'production' = 'development';

  @IsIn(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
  LOG_LEVEL = 'info';

  @Transform(toBool)
  @IsBoolean()
  LOG_PRETTY = false;

  @Transform(toBool)
  @IsBoolean()
  SWAGGER_ENABLED = true;

  @IsString()
  CORS_ORIGINS = '*';

  @IsString()
  @MinLength(32, { message: 'JWT_ACCESS_SECRET must be at least 32 characters' })
  JWT_ACCESS_SECRET: string;

  @Transform(toInt)
  @IsInt()
  @Min(60)
  @Max(3600)
  JWT_ACCESS_TTL_SECONDS = 900;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(90)
  JWT_REFRESH_TTL_DAYS = 30;

  @IsString()
  JWT_ISSUER = 'urban-alert-auth';

  @IsString()
  JWT_AUDIENCE = 'urban-alert-api';

  @IsString()
  @MinLength(16, { message: 'INTERNAL_API_KEY must be at least 16 characters' })
  INTERNAL_API_KEY: string;

  @IsString()
  REDIS_URL = 'redis://localhost:6379';

  @IsString()
  KAFKA_BROKERS = 'localhost:9092';

  @Transform(toInt)
  @IsInt()
  @Min(0)
  @Max(10)
  KAFKA_CONSUMER_MAX_RETRIES = 3;

  @IsString()
  AUTH_SERVICE_URL = 'http://localhost:3001';

  @IsString()
  USER_SERVICE_URL = 'http://localhost:3002';

  @IsString()
  INCIDENT_SERVICE_URL = 'http://localhost:3003';

  @IsString()
  MODERATION_SERVICE_URL = 'http://localhost:3004';

  @IsString()
  NOTIFICATION_SERVICE_URL = 'http://localhost:3005';

  @Transform(toInt)
  @IsInt()
  @Min(1)
  RATE_LIMIT_WINDOW_SECONDS = 60;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  RATE_LIMIT_MAX_REQUESTS = 120;

  @Transform(toInt)
  @IsInt()
  @Min(0)
  INCIDENT_CACHE_TTL_SECONDS = 60;

  @Transform(toInt)
  @IsInt()
  @Min(10)
  @Max(5000)
  DUPLICATE_RADIUS_METERS = 200;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(1440)
  DUPLICATE_WINDOW_MINUTES = 60;

  @IsOptional()
  @IsString()
  FCM_PROJECT_ID?: string;

  @IsOptional()
  @IsString()
  FCM_CLIENT_EMAIL?: string;

  @IsOptional()
  @IsString()
  FCM_PRIVATE_KEY?: string;
}

export function validateEnvironment(raw: Record<string, unknown>): EnvironmentVariables {
  const env = plainToInstance(EnvironmentVariables, raw, { exposeDefaultValues: true });
  const errors = validateSync(env, { skipMissingProperties: false, whitelist: false });
  if (errors.length > 0) {
    const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
    throw new Error(`Invalid environment configuration:\n  - ${messages.join('\n  - ')}`);
  }
  return env;
}
