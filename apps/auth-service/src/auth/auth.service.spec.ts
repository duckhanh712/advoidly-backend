import { ConflictException, UnauthorizedException } from '@app/common';
import { EventTypes, UserRole } from '@app/contracts';
import { PrismaService } from '@app/database';
import { EventPublisher } from '@app/kafka';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

describe('AuthService', () => {
  const passwords = new PasswordService();
  const tokens = { issue: jest.fn().mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' }) };
  const events = { publish: jest.fn().mockResolvedValue(undefined) };
  const prisma = { user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() } };
  const service = new AuthService(
    prisma as unknown as PrismaService,
    passwords,
    tokens as unknown as TokenService,
    events as unknown as EventPublisher,
  );

  let storedUser: {
    id: string;
    email: string;
    passwordHash: string;
    role: UserRole;
    createdAt: Date;
  };

  beforeAll(async () => {
    storedUser = {
      id: 'u1',
      email: 'a@example.com',
      passwordHash: await passwords.hash('Correct-Horse-1'),
      role: UserRole.USER,
      createdAt: new Date(),
    };
  });
  beforeEach(() => jest.clearAllMocks());

  describe('login', () => {
    it('issues tokens for valid credentials', async () => {
      prisma.user.findUnique.mockResolvedValue(storedUser);
      const result = await service.login({ email: storedUser.email, password: 'Correct-Horse-1' });
      expect(result.user).toEqual({
        id: 'u1',
        email: storedUser.email,
        role: UserRole.USER,
        createdAt: storedUser.createdAt,
      });
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(tokens.issue).toHaveBeenCalledWith(storedUser);
    });

    it('rejects a wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue(storedUser);
      await expect(service.login({ email: storedUser.email, password: 'wrong-1' })).rejects.toThrow(
        new UnauthorizedException('Invalid email or password'),
      );
      expect(tokens.issue).not.toHaveBeenCalled();
    });

    it('rejects an unknown email with the same message, after a dummy hash check', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const dummy = jest.spyOn(passwords, 'verifyAgainstDummy');
      await expect(service.login({ email: 'ghost@example.com', password: 'x1' })).rejects.toThrow(
        new UnauthorizedException('Invalid email or password'),
      );
      expect(dummy).toHaveBeenCalled();
    });
  });

  describe('register', () => {
    const dto = { email: 'new@example.com', password: 'Str0ngPassw0rd', displayName: 'New User' };

    it('stores an argon2id hash (never the plaintext) and publishes user.registered', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(({ data }) =>
        Promise.resolve({ ...data, id: 'u2', createdAt: new Date() }),
      );

      await service.register(dto, 'corr-1');

      const { passwordHash, role } = prisma.user.create.mock.calls[0][0].data;
      expect(passwordHash).toMatch(/^\$argon2id\$/);
      expect(passwordHash).not.toContain(dto.password);
      expect(role).toBe(UserRole.USER);
      expect(events.publish).toHaveBeenCalledWith(
        EventTypes.USER_REGISTERED,
        { userId: 'u2', email: dto.email, displayName: dto.displayName, role: UserRole.USER },
        { correlationId: 'corr-1', key: 'u2' },
      );
    });

    it('rejects a duplicate email', async () => {
      prisma.user.findUnique.mockResolvedValue(storedUser);
      await expect(service.register(dto, 'c')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('still succeeds when the event cannot be published', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(({ data }) =>
        Promise.resolve({ ...data, id: 'u3', createdAt: new Date() }),
      );
      events.publish.mockRejectedValueOnce(new Error('kafka down'));
      await expect(service.register(dto, 'c')).resolves.toHaveProperty('tokens');
    });
  });
});
