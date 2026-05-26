import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

interface JwtPayload {
  sub?: string;
  userId?: string;
  exp?: number;
  nbf?: number;
}

interface AuthenticatedRequestUser {
  id?: string;
}

export interface AuthenticatedRequest {
  headers?: {
    authorization?: string;
  };
  user?: AuthenticatedRequestUser;
}

@Injectable()
export class AuthenticatedRequestGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (request.user?.id) {
      return true;
    }

    const token = this.extractBearerToken(request.headers?.authorization);
    const userId = this.extractUserId(token);

    request.user = { id: userId };

    return true;
  }

  private extractBearerToken(authorizationHeader?: string): string {
    if (!authorizationHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication is required.',
      });
    }

    const token = authorizationHeader.slice('Bearer '.length).trim();

    if (!token) {
      throw new UnauthorizedException({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication is required.',
      });
    }

    return token;
  }

  private extractUserId(token: string): string {
    const secret = this.configService.get<string>('jwt.accessSecret');

    if (!secret) {
      throw new InternalServerErrorException({
        code: 'AUTH_CONFIGURATION_INVALID',
        message: 'JWT access token verification is not configured.',
      });
    }

    const payload = this.verifyAccessToken(token, secret);
    const userId =
      typeof payload.sub === 'string'
        ? payload.sub
        : typeof payload.userId === 'string'
          ? payload.userId
          : null;

    if (!userId) {
      throw new UnauthorizedException({
        code: 'AUTH_TOKEN_INVALID',
        message: 'Access token is invalid.',
      });
    }

    return userId;
  }

  private verifyAccessToken(token: string, secret: string): JwtPayload {
    const segments = token.split('.');

    if (segments.length !== 3) {
      throw new UnauthorizedException({
        code: 'AUTH_TOKEN_INVALID',
        message: 'Access token is invalid.',
      });
    }

    const [encodedHeader, encodedPayload, encodedSignature] = segments;
    const header = parseJwtSegment<Record<string, unknown>>(encodedHeader);
    const payload = parseJwtSegment<JwtPayload>(encodedPayload);

    if (header['alg'] !== 'HS256' || header['typ'] !== 'JWT') {
      throw new UnauthorizedException({
        code: 'AUTH_TOKEN_INVALID',
        message: 'Access token is invalid.',
      });
    }

    const expectedSignature = createHmac('sha256', secret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest();
    const receivedSignature = decodeBase64Url(encodedSignature);

    if (
      expectedSignature.length !== receivedSignature.length ||
      !timingSafeEqual(expectedSignature, receivedSignature)
    ) {
      throw new UnauthorizedException({
        code: 'AUTH_TOKEN_INVALID',
        message: 'Access token is invalid.',
      });
    }

    const nowInSeconds = Math.floor(Date.now() / 1000);

    if (
      (typeof payload.nbf === 'number' && payload.nbf > nowInSeconds) ||
      (typeof payload.exp === 'number' && payload.exp <= nowInSeconds)
    ) {
      throw new UnauthorizedException({
        code: 'AUTH_TOKEN_INVALID',
        message: 'Access token is invalid.',
      });
    }

    return payload;
  }
}

function parseJwtSegment<T>(segment: string): T {
  try {
    return JSON.parse(decodeBase64Url(segment).toString('utf8')) as T;
  } catch {
    throw new UnauthorizedException({
      code: 'AUTH_TOKEN_INVALID',
      message: 'Access token is invalid.',
    });
  }
}

function decodeBase64Url(value: string): Buffer {
  const paddingLength = (4 - (value.length % 4)) % 4;
  const normalizedValue = `${value}${'='.repeat(paddingLength)}`
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  return Buffer.from(normalizedValue, 'base64');
}
