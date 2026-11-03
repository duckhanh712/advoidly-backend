import { EnvironmentVariables, validateEnvironment } from './environment';
import { DEFAULT_PORTS, SERVICE_ENV_PREFIX, ServiceName } from './service-name';

export interface AppConfig {
  serviceName: ServiceName;
  env: EnvironmentVariables['NODE_ENV'];
  isProduction: boolean;
  port: number;
  /** Least-privileged connection string for this service; undefined for the gateway. */
  databaseUrl?: string;
  log: { level: string; pretty: boolean };
  http: { corsOrigins: string[]; swaggerEnabled: boolean };
  jwt: {
    accessSecret: string;
    accessTtlSeconds: number;
    refreshTtlDays: number;
    issuer: string;
    audience: string;
  };
  internalApiKey: string;
  redisUrl: string;
  kafka: { brokers: string[]; clientId: string; consumerMaxRetries: number };
  services: Record<'auth' | 'user' | 'incident' | 'moderation' | 'notification', string>;
  rateLimit: { windowSeconds: number; maxRequests: number };
  incident: { cacheTtlSeconds: number; endReportsToResolve: number };
  moderation: { duplicateRadiusMeters: number; duplicateWindowMinutes: number };
  fcm?: { projectId: string; clientEmail: string; privateKey: string };
}

const SERVICES_WITHOUT_DATABASE: ServiceName[] = ['api-gateway'];

/**
 * Builds the typed configuration for one service.
 * Service-specific variables take precedence over the generic ones:
 * `INCIDENT_SERVICE_DATABASE_URL` > `DATABASE_URL`, `INCIDENT_SERVICE_PORT` > `PORT`.
 * The generic form is intended for containers, where each service has its own environment.
 */
export function buildAppConfig(
  serviceName: ServiceName,
  raw: Record<string, string | undefined> = process.env,
): AppConfig {
  const env = validateEnvironment(raw);
  const prefix = SERVICE_ENV_PREFIX[serviceName];

  const portValue = raw[`${prefix}_PORT`] ?? raw.PORT;
  const port = portValue ? Number(portValue) : DEFAULT_PORTS[serviceName];
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid environment configuration: ${prefix}_PORT must be a valid port`);
  }

  const databaseUrl = raw[`${prefix}_DATABASE_URL`] ?? raw.DATABASE_URL;
  if (!databaseUrl && !SERVICES_WITHOUT_DATABASE.includes(serviceName)) {
    throw new Error(
      `Invalid environment configuration: ${prefix}_DATABASE_URL (or DATABASE_URL) is required`,
    );
  }

  const fcmConfigured = Boolean(env.FCM_PROJECT_ID && env.FCM_CLIENT_EMAIL && env.FCM_PRIVATE_KEY);

  return {
    serviceName,
    env: env.NODE_ENV,
    isProduction: env.NODE_ENV === 'production',
    port,
    databaseUrl,
    log: { level: env.LOG_LEVEL, pretty: env.LOG_PRETTY },
    http: {
      corsOrigins: env.CORS_ORIGINS.split(',')
        .map((o) => o.trim())
        .filter(Boolean),
      swaggerEnabled: env.SWAGGER_ENABLED,
    },
    jwt: {
      accessSecret: env.JWT_ACCESS_SECRET,
      accessTtlSeconds: env.JWT_ACCESS_TTL_SECONDS,
      refreshTtlDays: env.JWT_REFRESH_TTL_DAYS,
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    },
    internalApiKey: env.INTERNAL_API_KEY,
    redisUrl: env.REDIS_URL,
    kafka: {
      brokers: env.KAFKA_BROKERS.split(',')
        .map((b) => b.trim())
        .filter(Boolean),
      clientId: serviceName,
      consumerMaxRetries: env.KAFKA_CONSUMER_MAX_RETRIES,
    },
    services: {
      auth: env.AUTH_SERVICE_URL,
      user: env.USER_SERVICE_URL,
      incident: env.INCIDENT_SERVICE_URL,
      moderation: env.MODERATION_SERVICE_URL,
      notification: env.NOTIFICATION_SERVICE_URL,
    },
    rateLimit: {
      windowSeconds: env.RATE_LIMIT_WINDOW_SECONDS,
      maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
    },
    incident: {
      cacheTtlSeconds: env.INCIDENT_CACHE_TTL_SECONDS,
      endReportsToResolve: env.INCIDENT_END_REPORTS_TO_RESOLVE,
    },
    moderation: {
      duplicateRadiusMeters: env.DUPLICATE_RADIUS_METERS,
      duplicateWindowMinutes: env.DUPLICATE_WINDOW_MINUTES,
    },
    fcm: fcmConfigured
      ? {
          projectId: env.FCM_PROJECT_ID!,
          clientEmail: env.FCM_CLIENT_EMAIL!,
          // Keys stored in env files usually have escaped newlines.
          privateKey: env.FCM_PRIVATE_KEY!.replace(/\\n/g, '\n'),
        }
      : undefined,
  };
}
