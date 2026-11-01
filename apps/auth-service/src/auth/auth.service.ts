import { Injectable, Logger } from '@nestjs/common';
import { User } from '@prisma/client';
import { ConflictException, ResourceNotFoundException, UnauthorizedException } from '@app/common';
import { EventTypes, UserRole } from '@app/contracts';
import { PrismaService } from '@app/database';
import { EventPublisher } from '@app/kafka';
import { AuthResultDto, AuthUserDto, LoginDto, RegisterDto, TokenPairDto } from './dto/auth.dto';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

const INVALID_CREDENTIALS = 'Invalid email or password';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly events: EventPublisher,
  ) {}

  async register(dto: RegisterDto, correlationId: string): Promise<AuthResultDto> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email is already registered');

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash: await this.passwords.hash(dto.password),
        role: UserRole.USER,
      },
    });

    // Not transactional with the insert: if publishing fails the account still exists and
    // user-service creates the profile lazily on first access. See ADR-007 (outbox).
    await this.events
      .publish(
        EventTypes.USER_REGISTERED,
        {
          userId: user.id,
          email: user.email,
          displayName: dto.displayName,
          role: user.role as UserRole,
        },
        { correlationId, key: user.id },
      )
      .catch((error: unknown) =>
        this.logger.error(
          { err: error, userId: user.id, correlationId },
          'Failed to publish user.registered',
        ),
      );

    return { user: toAuthUser(user), tokens: await this.tokens.issue(user) };
  }

  async login(dto: LoginDto): Promise<AuthResultDto> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const valid = user
      ? await this.passwords.verify(user.passwordHash, dto.password)
      : await this.passwords.verifyAgainstDummy(dto.password);
    if (!user || !valid) throw new UnauthorizedException(INVALID_CREDENTIALS);

    if (this.passwords.needsRehash(user.passwordHash)) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await this.passwords.hash(dto.password) },
      });
    }
    return { user: toAuthUser(user), tokens: await this.tokens.issue(user) };
  }

  refresh(refreshToken: string): Promise<TokenPairDto> {
    return this.tokens.rotate(refreshToken);
  }

  logout(refreshToken: string, userId: string): Promise<void> {
    return this.tokens.revoke(refreshToken, userId);
  }

  async me(userId: string): Promise<AuthUserDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new ResourceNotFoundException('User', userId);
    return toAuthUser(user);
  }
}

function toAuthUser(user: User): AuthUserDto {
  return { id: user.id, email: user.email, role: user.role as UserRole, createdAt: user.createdAt };
}
