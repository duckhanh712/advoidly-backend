import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Authenticated, CorrelationId, CurrentUser, Public } from '@app/common';
import type { AuthenticatedUser } from '@app/contracts';
import { AuthService } from './auth.service';
import {
  AuthResultDto,
  AuthUserDto,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
  TokenPairDto,
} from './dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  @ApiCreatedResponse({ type: AuthResultDto })
  @ApiConflictResponse({ description: 'Email is already registered' })
  register(
    @Body() dto: RegisterDto,
    @CorrelationId() correlationId: string,
  ): Promise<AuthResultDto> {
    return this.auth.register(dto, correlationId);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AuthResultDto })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password' })
  login(@Body() dto: LoginDto): Promise<AuthResultDto> {
    return this.auth.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: TokenPairDto,
    description: 'New token pair; the presented refresh token is revoked',
  })
  refresh(@Body() dto: RefreshTokenDto): Promise<TokenPairDto> {
    return this.auth.refresh(dto.refreshToken);
  }

  @Authenticated()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Body() dto: RefreshTokenDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.auth.logout(dto.refreshToken, user.id);
  }

  @Authenticated()
  @Get('me')
  @ApiOkResponse({ type: AuthUserDto })
  me(@CurrentUser() user: AuthenticatedUser): Promise<AuthUserDto> {
    return this.auth.me(user.id);
  }
}
