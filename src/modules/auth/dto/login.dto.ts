import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

const SHA256_HEX = /^[a-f0-9]{64}$/i;

export class LoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  loginId!: string;

  @IsString()
  @Matches(SHA256_HEX, { message: 'passwordHash must be a SHA-256 hex string' })
  passwordHash!: string;
}
