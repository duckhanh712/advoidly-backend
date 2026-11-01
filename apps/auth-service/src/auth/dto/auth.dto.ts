import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRole } from '@app/contracts';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class RegisterDto {
  @ApiProperty({ example: 'nguyen.van.a@example.com' })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(320)
  email: string;

  @ApiProperty({ minLength: 8, maxLength: 128, example: 'Str0ngPassw0rd' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'password must contain at least one letter and one digit',
  })
  password: string;

  @ApiProperty({ minLength: 2, maxLength: 100, example: 'Nguyễn Văn A' })
  @Transform(trim)
  @IsString()
  @Length(2, 100)
  displayName: string;
}

export class LoginDto {
  @ApiProperty({ example: 'nguyen.van.a@example.com' })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(320)
  email: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;
}

export class RefreshTokenDto {
  @ApiProperty({ description: 'Opaque refresh token returned by login/register/refresh' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  refreshToken: string;
}

export class AuthUserDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() email: string;
  @ApiProperty({ enum: UserRole }) role: UserRole;
  @ApiProperty() createdAt: Date;
}

export class TokenPairDto {
  @ApiProperty() accessToken: string;
  @ApiProperty() refreshToken: string;
  @ApiProperty({ example: 'Bearer' }) tokenType: 'Bearer';
  @ApiProperty({ description: 'Access token lifetime in seconds' }) expiresIn: number;
  @ApiProperty() refreshTokenExpiresAt: Date;
}

export class AuthResultDto {
  @ApiProperty({ type: AuthUserDto }) user: AuthUserDto;
  @ApiProperty({ type: TokenPairDto }) tokens: TokenPairDto;
}
