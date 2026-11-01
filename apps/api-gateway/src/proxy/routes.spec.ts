import { isPublicRoute, matchRoute } from './routes';

describe('gateway routing', () => {
  it.each([
    ['/api/v1/auth/login', 'auth'],
    ['/api/v1/users/me/saved-areas', 'user'],
    ['/api/v1/incidents', 'incident'],
    ['/api/v1/moderation/reports/1/approve', 'moderation'],
    ['/api/v1/notifications/read-all', 'notification'],
  ])('routes %s to %s', (path, service) => {
    expect(matchRoute(path)?.service).toBe(service);
  });

  it.each([
    '/api/v1/incidentsx',
    '/api/v2/incidents',
    '/internal/incidents/1/transitions',
    '/health',
  ])('does not proxy %s', (path) => expect(matchRoute(path)).toBeUndefined());

  it.each([
    ['POST', '/api/v1/auth/register'],
    ['POST', '/api/v1/auth/login'],
    ['POST', '/api/v1/auth/refresh'],
    ['GET', '/api/v1/incidents'],
    ['GET', '/api/v1/incidents/nearby'],
    ['GET', '/api/v1/incidents/2f1c6e0a-8f0e-4a8e-9a55-0d4d1b2c3e4f'],
    ['OPTIONS', '/api/v1/users/me'],
  ])('%s %s is public', (method, path) => expect(isPublicRoute(method, path)).toBe(true));

  it.each([
    ['POST', '/api/v1/auth/logout'],
    ['GET', '/api/v1/auth/me'],
    ['POST', '/api/v1/incidents'],
    ['PATCH', '/api/v1/incidents/2f1c6e0a-8f0e-4a8e-9a55-0d4d1b2c3e4f'],
    ['GET', '/api/v1/incidents/2f1c6e0a-8f0e-4a8e-9a55-0d4d1b2c3e4f/history'],
    ['GET', '/api/v1/users/me'],
    ['GET', '/api/v1/moderation/reports'],
    ['GET', '/api/v1/notifications'],
  ])('%s %s requires a token', (method, path) => expect(isPublicRoute(method, path)).toBe(false));
});
