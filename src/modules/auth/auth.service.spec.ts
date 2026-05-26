import { HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, IsNull, Repository } from 'typeorm';
import { JwtTokenService } from '../../integrations/jwt/jwt-token.service';
import { AiChatSession } from '../ai-chat-sessions/entity/ai-chat-session.entity';
import { AUTH_ERROR } from './constants/auth-error.constants';
import { AuthService } from './auth.service';
import { RefreshToken } from './entity/refresh-token.entity';
import { User } from './entity/user.entity';

describe('AuthService', () => {
  const passwordHash = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';

  let userRepository: jest.Mocked<Repository<User>>;
  let refreshTokenRepository: jest.Mocked<Repository<RefreshToken>>;
  let aiChatSessionRepository: jest.Mocked<Repository<AiChatSession>>;
  let jwtTokenService: jest.Mocked<JwtTokenService>;
  let configService: jest.Mocked<ConfigService>;
  let dataSource: jest.Mocked<DataSource>;
  let service: AuthService;

  beforeEach(() => {
    userRepository = {
      findOne: jest.fn(),
      findOneBy: jest.fn(),
      create: jest.fn((value) => value as User),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<User>>;

    refreshTokenRepository = {
      findOne: jest.fn(),
      create: jest.fn((value) => value as RefreshToken),
      save: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<Repository<RefreshToken>>;

    aiChatSessionRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<AiChatSession>>;

    jwtTokenService = {
      signAccessToken: jest.fn().mockReturnValue('access-token'),
      generateRefreshToken: jest.fn().mockReturnValue('refresh-token'),
      hashRefreshToken: jest.fn().mockReturnValue('hashed-refresh-token'),
      getRefreshExpiresAt: jest.fn().mockReturnValue(new Date('2030-01-01T00:00:00Z')),
    } as unknown as jest.Mocked<JwtTokenService>;

    configService = {
      get: jest.fn().mockReturnValue('gpt-4o'),
    } as unknown as jest.Mocked<ConfigService>;

    dataSource = {
      transaction: jest.fn(),
    } as unknown as jest.Mocked<DataSource>;

    service = new AuthService(
      userRepository,
      refreshTokenRepository,
      aiChatSessionRepository,
      jwtTokenService,
      configService,
      dataSource,
    );
  });

  describe('checkNickname', () => {
    it('returns available when nickname is unused', async () => {
      userRepository.findOne.mockResolvedValue(null);
      await expect(service.checkNickname('new-user')).resolves.toEqual({ isAvailable: true });
    });

    it('returns unavailable when nickname exists', async () => {
      userRepository.findOne.mockResolvedValue({ id: 'user-1' } as User);
      await expect(service.checkNickname('taken')).resolves.toEqual({ isAvailable: false });
    });
  });

  describe('signup', () => {
    it('creates user and one AI chat session in a transaction', async () => {
      userRepository.findOne.mockResolvedValue(null);

      const savedUser = {
        id: 'user-1',
        loginId: 'user123',
        nickname: 'coder',
        email: null,
        passwordHash,
        createdAt: new Date('2026-05-04T00:00:00Z'),
      } as User;

      const userRepo = {
        create: jest.fn().mockReturnValue(savedUser),
        save: jest.fn().mockResolvedValue(savedUser),
      };
      const sessionRepo = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation((value) => value),
        save: jest.fn().mockResolvedValue({ id: 'session-1' }),
      };

      (dataSource.transaction as jest.Mock).mockImplementation(
        async (callback: (manager: { getRepository: (entity: unknown) => unknown }) => unknown) => {
          const manager = {
            getRepository: (entity: unknown) => {
              if (entity === User) {
                return userRepo;
              }
              return sessionRepo;
            },
          };
          return callback(manager);
        },
      );

      const result = await service.signup({
        loginId: 'user123',
        nickname: 'coder',
        passwordHash,
      });

      expect(result.userId).toBe('user-1');
      expect(sessionRepo.save).toHaveBeenCalledTimes(1);
      expect(sessionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          requesterUserId: 'user-1',
          status: 'ACTIVE',
        }),
      );
    });

    it('does not create a second AI chat session when one already exists', async () => {
      userRepository.findOne.mockResolvedValue(null);

      const savedUser = {
        id: 'user-1',
        loginId: 'user123',
        nickname: 'coder',
        email: null,
        passwordHash,
        createdAt: new Date('2026-05-04T00:00:00Z'),
      } as User;

      const sessionRepo = {
        findOne: jest.fn().mockResolvedValue({ id: 'existing-session' }),
        create: jest.fn(),
        save: jest.fn(),
      };
      const userRepo = {
        create: jest.fn().mockReturnValue(savedUser),
        save: jest.fn().mockResolvedValue(savedUser),
      };

      (dataSource.transaction as jest.Mock).mockImplementation(
        async (callback: (manager: { getRepository: (entity: unknown) => unknown }) => unknown) => {
          const manager = {
            getRepository: (entity: unknown) => (entity === User ? userRepo : sessionRepo),
          };
          return callback(manager);
        },
      );

      await service.signup({
        loginId: 'user123',
        nickname: 'coder',
        passwordHash,
      });

      expect(sessionRepo.save).not.toHaveBeenCalled();
    });

    it('rejects duplicate nickname before signup', async () => {
      userRepository.findOne.mockResolvedValue({ id: 'existing' } as User);

      await expect(
        service.signup({
          loginId: 'user123',
          nickname: 'coder',
          passwordHash,
        }),
      ).rejects.toMatchObject({
        response: { code: AUTH_ERROR.NICKNAME_CONFLICT },
      });
    });
  });

  describe('login', () => {
    it('returns tokens for valid credentials', async () => {
      userRepository.findOne.mockResolvedValue({
        id: 'user-1',
        loginId: 'user123',
        nickname: 'coder',
        email: null,
        passwordHash,
      } as User);
      refreshTokenRepository.save.mockResolvedValue({} as RefreshToken);

      const result = await service.login({ loginId: 'user123', passwordHash });

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');
      expect(jwtTokenService.hashRefreshToken).toHaveBeenCalledWith('refresh-token');
      expect(refreshTokenRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ tokenHash: 'hashed-refresh-token' }),
      );
    });

    it('fails with invalid credentials', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(service.login({ loginId: 'user123', passwordHash })).rejects.toMatchObject({
        status: HttpStatus.UNAUTHORIZED,
        response: { code: AUTH_ERROR.INVALID_CREDENTIALS },
      });
    });
  });

  describe('refreshToken', () => {
    const stored = {
      id: 'token-row-1',
      userId: 'user-1',
      tokenHash: 'hashed-refresh-token',
      expiresAt: new Date('2030-01-01T00:00:00Z'),
      revokedAt: null,
      user: {
        id: 'user-1',
        loginId: 'user123',
      } as User,
    } as RefreshToken;

    const setupRefreshTransaction = (refreshRepo: {
      findOne: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
      save: jest.Mock;
    }) => {
      (dataSource.transaction as jest.Mock).mockImplementation(
        async (callback: (manager: { getRepository: (entity: unknown) => unknown }) => unknown) => {
          const manager = {
            getRepository: (entity: unknown) => {
              if (entity === RefreshToken) {
                return refreshRepo;
              }
              return { findOneBy: jest.fn() };
            },
          };
          return callback(manager);
        },
      );
    };

    it('revokes the previous refresh token and issues a new pair', async () => {
      const refreshRepo = {
        findOne: jest.fn().mockResolvedValue(stored),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
        create: jest.fn().mockImplementation((value) => value),
        save: jest.fn().mockResolvedValue({}),
      };

      setupRefreshTransaction(refreshRepo);
      jwtTokenService.generateRefreshToken.mockReturnValue('new-refresh-token');

      const result = await service.refreshToken('presented-refresh-token');

      expect(refreshRepo.findOne).toHaveBeenCalledWith({
        where: { tokenHash: 'hashed-refresh-token' },
        relations: ['user'],
      });
      expect(refreshRepo.update).toHaveBeenCalledWith(
        { id: 'token-row-1', revokedAt: IsNull() },
        { revokedAt: expect.any(Date) },
      );
      expect(refreshRepo.save).toHaveBeenCalled();
      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('new-refresh-token');
    });

    it('rejects refresh when revoke update affects zero rows (concurrent reuse)', async () => {
      const refreshRepo = {
        findOne: jest.fn().mockResolvedValue(stored),
        update: jest.fn().mockResolvedValue({ affected: 0 }),
        create: jest.fn(),
        save: jest.fn(),
      };

      setupRefreshTransaction(refreshRepo);

      await expect(service.refreshToken('presented-refresh-token')).rejects.toMatchObject({
        response: { code: AUTH_ERROR.REFRESH_TOKEN_REVOKED },
      });
      expect(refreshRepo.save).not.toHaveBeenCalled();
    });

    it('rejects already revoked refresh tokens', async () => {
      const refreshRepo = {
        findOne: jest.fn().mockResolvedValue({
          ...stored,
          revokedAt: new Date(),
        }),
        update: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
      };

      setupRefreshTransaction(refreshRepo);

      await expect(service.refreshToken('revoked')).rejects.toMatchObject({
        response: { code: AUTH_ERROR.REFRESH_TOKEN_REVOKED },
      });
      expect(refreshRepo.update).not.toHaveBeenCalled();
    });
  });
});
