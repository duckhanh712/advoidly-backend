import { UserRole } from '@app/contracts';
import { bearer, createTestApp, TestApp } from '../../../../test/utils/test-app';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController (HTTP)', () => {
  let t: TestApp;
  const auth = {
    register: jest.fn().mockResolvedValue({ user: { id: 'u1' }, tokens: {} }),
    login: jest.fn().mockResolvedValue({ user: { id: 'u1' }, tokens: {} }),
    refresh: jest.fn(),
    logout: jest.fn().mockResolvedValue(undefined),
    me: jest.fn().mockImplementation((id: string) => Promise.resolve({ id })),
  };

  beforeAll(async () => {
    t = await createTestApp('auth-service', {
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: auth }],
    });
  });
  afterAll(() => t.close());
  beforeEach(() => jest.clearAllMocks());

  const register = (payload: object) =>
    t.request({ method: 'POST', url: '/api/v1/auth/register', payload });
  const login = (payload: object) =>
    t.request({ method: 'POST', url: '/api/v1/auth/login', payload });
  const fields = (res: Awaited<ReturnType<typeof register>>) =>
    res.json().error.details.map((d: { field: string }) => d.field);

  describe('POST /auth/register validation', () => {
    const valid = {
      email: 'Nguyen.Van.A@Example.com ',
      password: 'Str0ngPassw0rd',
      displayName: '  Văn A ',
    };

    it('accepts a valid request and normalises email and display name', async () => {
      const res = await register(valid);
      expect(res.statusCode).toBe(201);
      expect(auth.register).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'nguyen.van.a@example.com', displayName: 'Văn A' }),
        expect.any(String),
      );
    });

    it.each([
      ['an invalid email', { email: 'not-an-email' }, 'email'],
      ['a short password', { password: 'Ab1' }, 'password'],
      ['a password without digits', { password: 'onlyletters' }, 'password'],
      ['a password over 128 chars', { password: `A1${'x'.repeat(130)}` }, 'password'],
      ['a too-short display name', { displayName: ' a ' }, 'displayName'],
    ])('rejects %s', async (_label, override, field) => {
      const res = await register({ ...valid, ...override });
      expect(res.statusCode).toBe(400);
      expect(fields(res)).toEqual([field]);
      expect(auth.register).not.toHaveBeenCalled();
    });

    it('reports every missing field', async () => {
      const res = await register({});
      expect(fields(res).sort()).toEqual(['displayName', 'email', 'password']);
    });

    it('does not let clients choose their role', async () => {
      const res = await register({ ...valid, role: UserRole.ADMIN });
      expect(res.statusCode).toBe(400);
      expect(fields(res)).toEqual(['role']);
    });
  });

  describe('POST /auth/login validation', () => {
    it('accepts email + password and returns 200', async () => {
      const res = await login({ email: 'A@B.CO', password: 'whatever1' });
      expect(res.statusCode).toBe(200);
      expect(auth.login).toHaveBeenCalledWith(expect.objectContaining({ email: 'a@b.co' }));
    });

    it.each([
      ['missing password', { email: 'a@b.co' }, 'password'],
      ['empty password', { email: 'a@b.co', password: '' }, 'password'],
      ['invalid email', { email: 'nope', password: 'x' }, 'email'],
    ])('rejects %s', async (_label, payload, field) => {
      const res = await login(payload);
      expect(res.statusCode).toBe(400);
      expect(fields(res)).toEqual([field]);
    });
  });

  describe('JWT authentication', () => {
    it('GET /auth/me requires a token', async () => {
      const res = await t.request({ method: 'GET', url: '/api/v1/auth/me' });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    });

    it('GET /auth/me rejects a tampered token', async () => {
      const { authorization } = bearer(t.jwt, UserRole.USER);
      const tampered = authorization.slice(0, -2) + (authorization.endsWith('A') ? 'BB' : 'AA');
      const res = await t.request({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { authorization: tampered },
      });
      expect(res.statusCode).toBe(401);
    });

    it('GET /auth/me returns the token subject', async () => {
      const res = await t.request({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: bearer(t.jwt, UserRole.USER, '11111111-2222-4333-8444-555555555555'),
      });
      expect(res.statusCode).toBe(200);
      expect(auth.me).toHaveBeenCalledWith('11111111-2222-4333-8444-555555555555');
    });

    it('POST /auth/logout requires a token', async () => {
      const res = await t.request({
        method: 'POST',
        url: '/api/v1/auth/logout',
        payload: { refreshToken: 'x' },
      });
      expect(res.statusCode).toBe(401);
      expect(auth.logout).not.toHaveBeenCalled();
    });
  });
});
