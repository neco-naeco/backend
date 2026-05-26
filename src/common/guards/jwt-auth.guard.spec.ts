import { ExecutionContext, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtTokenService } from '../../integrations/jwt/jwt-token.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let reflector: jest.Mocked<Reflector>;
  let jwtTokenService: jest.Mocked<JwtTokenService>;
  let guard: JwtAuthGuard;

  const createContext = (authorization?: string) => {
    const request: {
      headers: { authorization?: string };
      user?: { userId: string; loginId: string };
    } = { headers: {} };

    if (authorization !== undefined) {
      request.headers.authorization = authorization;
    }

    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
      request,
    } as unknown as ExecutionContext & { request: typeof request };
  };

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    jwtTokenService = {
      verifyAccessToken: jest.fn(),
    } as unknown as jest.Mocked<JwtTokenService>;

    guard = new JwtAuthGuard(reflector, jwtTokenService);
  });

  it('allows public routes without a token', () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const context = createContext();

    expect(guard.canActivate(context)).toBe(true);
    expect(jwtTokenService.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('attaches the authenticated user when the token is valid', () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    jwtTokenService.verifyAccessToken.mockReturnValue({
      sub: 'user-1',
      loginId: 'player1',
    });

    const context = createContext('Bearer valid-token');

    expect(guard.canActivate(context)).toBe(true);
    expect(context.request.user).toEqual({ userId: 'user-1', loginId: 'player1' });
  });

  it('rejects missing bearer tokens', () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const context = createContext();

    try {
      guard.canActivate(context);
      fail('expected guard to reject missing token');
    } catch (error) {
      expect(error).toMatchObject({
        status: HttpStatus.UNAUTHORIZED,
        response: { code: 'AUTH_TOKEN_INVALID' },
      });
    }
  });

  it('uses IS_PUBLIC_KEY metadata lookup', () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    guard.canActivate(createContext());

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
      expect.anything(),
      expect.anything(),
    ]);
  });
});
