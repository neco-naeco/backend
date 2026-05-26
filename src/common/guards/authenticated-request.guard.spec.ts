/// <reference types="jest" />

import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { ExecutionContext } from '@nestjs/common';
import { AuthenticatedRequestGuard } from './authenticated-request.guard';

describe('AuthenticatedRequestGuard', () => {
  let guard: AuthenticatedRequestGuard;
  let configService: { get: jest.Mock };

  beforeEach(() => {
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'jwt.accessSecret') {
          return 'test-access-secret';
        }

        return undefined;
      }),
    };

    guard = new AuthenticatedRequestGuard(
      configService as unknown as ConfigService,
    );
  });

  it('accepts a valid bearer token and assigns request.user.id', () => {
    const request = {
      headers: {
        authorization: `Bearer ${createHs256Token({
          sub: 'user-1',
          exp: Math.floor(Date.now() / 1000) + 60,
        })}`,
      },
    };

    const canActivate = guard.canActivate(createExecutionContext(request));

    expect(canActivate).toBe(true);
    expect(request).toMatchObject({
      user: {
        id: 'user-1',
      },
    });
  });

  it('accepts an already-authenticated request', () => {
    const request = {
      user: {
        id: 'user-1',
      },
    };

    const canActivate = guard.canActivate(createExecutionContext(request));

    expect(canActivate).toBe(true);
    expect(configService.get).not.toHaveBeenCalled();
  });

  it('rejects requests without a bearer token', () => {
    const request = {
      headers: {},
    };

    expect(() => guard.canActivate(createExecutionContext(request))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects requests with an invalid bearer token', () => {
    const request = {
      headers: {
        authorization: 'Bearer invalid.token.value',
      },
    };

    expect(() => guard.canActivate(createExecutionContext(request))).toThrow(
      UnauthorizedException,
    );
  });
});

function createExecutionContext(request: object): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}

function createHs256Token(payload: Record<string, unknown>): string {
  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };
  const encodedHeader = encodeBase64Url(JSON.stringify(header));
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = createHmac('sha256', 'test-access-secret')
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}
