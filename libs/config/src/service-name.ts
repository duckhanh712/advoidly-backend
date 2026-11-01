export const SERVICE_NAMES = [
  'api-gateway',
  'auth-service',
  'user-service',
  'incident-service',
  'moderation-service',
  'notification-service',
] as const;

export type ServiceName = (typeof SERVICE_NAMES)[number];

/** Prefix for service-specific variables, e.g. `INCIDENT_SERVICE_PORT`. */
export const SERVICE_ENV_PREFIX: Record<ServiceName, string> = {
  'api-gateway': 'API_GATEWAY',
  'auth-service': 'AUTH_SERVICE',
  'user-service': 'USER_SERVICE',
  'incident-service': 'INCIDENT_SERVICE',
  'moderation-service': 'MODERATION_SERVICE',
  'notification-service': 'NOTIFICATION_SERVICE',
};

export const DEFAULT_PORTS: Record<ServiceName, number> = {
  'api-gateway': 3000,
  'auth-service': 3001,
  'user-service': 3002,
  'incident-service': 3003,
  'moderation-service': 3004,
  'notification-service': 3005,
};
