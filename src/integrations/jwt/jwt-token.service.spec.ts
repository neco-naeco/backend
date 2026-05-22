import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { JwtTokenService } from './jwt-token.service';

describe('JwtTokenService', () => {
  const jwtService = {
    sign: jest.fn().mockReturnValue('signed-access-token'),
    verify: jest.fn(),
  } as unknown as JwtService;

  const configService = {
    getOrThrow: jest.fn((key: string) => {
      const values: Record<string, string> = {
        'jwt.accessSecret': 'access-secret',
        'jwt.accessExpiresIn': '15m',
        'jwt.refreshExpiresIn': '7d',
      };
      return values[key];
    }),
  } as unknown as ConfigService;

  const service = new JwtTokenService(jwtService, configService);

  it('hashes refresh tokens consistently', () => {
    const hash = service.hashRefreshToken('refresh-token-value');
    expect(hash).toHaveLength(64);
    expect(hash).toBe(service.hashRefreshToken('refresh-token-value'));
  });

  it('generates opaque refresh tokens', () => {
    const token = service.generateRefreshToken();
    expect(token).toHaveLength(64);
  });

  it('computes refresh expiry from configured duration', () => {
    const before = Date.now();
    const expiresAt = service.getRefreshExpiresAt();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + sevenDaysMs - 1000);
  });
});
