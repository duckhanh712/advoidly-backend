import { buildAppConfig } from './app-config';

const baseEnv = {
  JWT_ACCESS_SECRET: 'x'.repeat(32),
  INTERNAL_API_KEY: 'internal-key-123456',
};

describe('buildAppConfig', () => {
  it('prefers service-specific variables over generic ones', () => {
    const config = buildAppConfig('incident-service', {
      ...baseEnv,
      PORT: '9000',
      INCIDENT_SERVICE_PORT: '4003',
      DATABASE_URL: 'postgresql://generic',
      INCIDENT_SERVICE_DATABASE_URL: 'postgresql://incident',
    });

    expect(config.port).toBe(4003);
    expect(config.databaseUrl).toBe('postgresql://incident');
    expect(config.kafka.clientId).toBe('incident-service');
  });

  it('falls back to defaults and generic variables', () => {
    const config = buildAppConfig('auth-service', { ...baseEnv, DATABASE_URL: 'postgresql://db' });

    expect(config.port).toBe(3001);
    expect(config.databaseUrl).toBe('postgresql://db');
    expect(config.jwt.accessTtlSeconds).toBe(900);
    expect(config.fcm).toBeUndefined();
  });

  it('does not require a database for the gateway', () => {
    expect(() => buildAppConfig('api-gateway', baseEnv)).not.toThrow();
  });

  it('requires a database URL for data-owning services', () => {
    expect(() => buildAppConfig('user-service', baseEnv)).toThrow(/USER_SERVICE_DATABASE_URL/);
  });

  it('rejects a weak JWT secret', () => {
    expect(() => buildAppConfig('api-gateway', { ...baseEnv, JWT_ACCESS_SECRET: 'short' })).toThrow(
      /JWT_ACCESS_SECRET/,
    );
  });

  it('parses numeric and boolean variables', () => {
    const config = buildAppConfig('api-gateway', {
      ...baseEnv,
      RATE_LIMIT_MAX_REQUESTS: '5',
      SWAGGER_ENABLED: 'false',
      KAFKA_BROKERS: 'a:9092, b:9092',
    });

    expect(config.rateLimit.maxRequests).toBe(5);
    expect(config.http.swaggerEnabled).toBe(false);
    expect(config.kafka.brokers).toEqual(['a:9092', 'b:9092']);
  });
});
