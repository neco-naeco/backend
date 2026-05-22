import { HttpException, HttpStatus } from '@nestjs/common';

export const AUTH_ERROR = {
  LOGIN_ID_CONFLICT: 'AUTH_LOGIN_ID_CONFLICT',
  EMAIL_CONFLICT: 'AUTH_EMAIL_CONFLICT',
  NICKNAME_CONFLICT: 'AUTH_NICKNAME_CONFLICT',
  INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  REFRESH_TOKEN_REVOKED: 'AUTH_REFRESH_TOKEN_REVOKED',
  TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
} as const;

export function throwAuthError(
  code: string,
  message: string,
  status: HttpStatus = HttpStatus.BAD_REQUEST,
): never {
  throw new HttpException({ code, message }, status);
}
