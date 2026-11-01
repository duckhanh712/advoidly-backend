import type { AppConfig } from '@app/config';

export type DownstreamService = keyof AppConfig['services'];

export interface ProxyRoute {
  /** Path prefix, forwarded unchanged (services use the same `/api/v1` prefix). */
  prefix: string;
  service: DownstreamService;
}

export const PROXY_ROUTES: readonly ProxyRoute[] = [
  { prefix: '/api/v1/auth', service: 'auth' },
  { prefix: '/api/v1/users', service: 'user' },
  { prefix: '/api/v1/incidents', service: 'incident' },
  { prefix: '/api/v1/moderation', service: 'moderation' },
  { prefix: '/api/v1/notifications', service: 'notification' },
];

/**
 * Routes reachable without an access token. Everything else under PROXY_ROUTES requires a
 * valid bearer token at the gateway. Services still enforce their own authorization.
 */
export const PUBLIC_ROUTES: readonly { method: string; pattern: RegExp }[] = [
  { method: 'POST', pattern: /^\/api\/v1\/auth\/(register|login|refresh)\/?$/ },
  { method: 'GET', pattern: /^\/api\/v1\/incidents\/?$/ },
  { method: 'GET', pattern: /^\/api\/v1\/incidents\/nearby\/?$/ },
  { method: 'GET', pattern: /^\/api\/v1\/incidents\/[0-9a-fA-F-]{36}\/?$/ },
];

export function matchRoute(path: string): ProxyRoute | undefined {
  return PROXY_ROUTES.find((r) => path === r.prefix || path.startsWith(`${r.prefix}/`));
}

export function isPublicRoute(method: string, path: string): boolean {
  // CORS preflight never carries credentials.
  if (method === 'OPTIONS') return true;
  return PUBLIC_ROUTES.some((r) => r.method === method && r.pattern.test(path));
}
