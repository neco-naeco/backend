import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AUTH_ERROR, throwAuthError } from '../../modules/auth/constants/auth-error.constants';
import { JwtTokenService } from '../../integrations/jwt/jwt-token.service';
import type { AuthenticatedUser } from '../types/authenticated-user.type';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtTokenService: JwtTokenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      user?: AuthenticatedUser;
    }>();

    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      throwAuthError(
        AUTH_ERROR.TOKEN_INVALID,
        'Access token is missing or invalid',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const token = authorization.slice('Bearer '.length).trim();
    if (!token) {
      throwAuthError(
        AUTH_ERROR.TOKEN_INVALID,
        'Access token is missing or invalid',
        HttpStatus.UNAUTHORIZED,
      );
    }

    try {
      const payload = this.jwtTokenService.verifyAccessToken(token);
      request.user = {
        userId: payload.sub,
        loginId: payload.loginId,
      };
      return true;
    } catch (error) {
      if (error instanceof Error && error.name === 'TokenExpiredError') {
        throwAuthError(
          'AUTH_TOKEN_EXPIRED',
          'Access token has expired',
          HttpStatus.UNAUTHORIZED,
        );
      }

      throwAuthError(
        AUTH_ERROR.TOKEN_INVALID,
        'Access token is missing or invalid',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }
}
