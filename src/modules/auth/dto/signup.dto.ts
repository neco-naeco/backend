import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const SHA256_HEX = /^[a-f0-9]{64}$/i;

export class SignupDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  loginId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(32)
  nickname!: string;

  @IsString()
  @Matches(SHA256_HEX, { message: 'passwordHash must be a SHA-256 hex string' })
  passwordHash!: string;

  @IsOptional()
  @IsEmail()
  email?: string | null;
}
