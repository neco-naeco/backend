import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RUNTIME_ADAPTER } from '@integrations/runtime/runtime.constants';
import { ExecutionStatus } from '@shared/enums';
import { ExecutionEntity } from '../entity/execution.entity';
import { ExecutionsService } from './executions.service';

describe('ExecutionsService', () => {
  const createRepositoryMock = () => {
    const store = new Map<string, ExecutionEntity>();

    return {
      create: jest.fn((input: Partial<ExecutionEntity>) => ({
        id: store.size === 0 ? 'execution-1' : `execution-${store.size + 1}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...input,
      })),
      save: jest.fn(async (entity: ExecutionEntity) => {
        store.set(entity.id, {
          ...entity,
          updatedAt: new Date(),
        });

        return store.get(entity.id);
      }),
    };
  };

  it('persists the pending -> running -> success transition', async () => {
    const repository = createRepositoryMock();
    const runtimeAdapter = {
      executeMissionCode: jest.fn().mockResolvedValue({
        kind: 'completed',
        stdout: 'ok',
        stderr: '',
        exitCode: 0,
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ExecutionsService,
        {
          provide: getRepositoryToken(ExecutionEntity),
          useValue: repository,
        },
        {
          provide: RUNTIME_ADAPTER,
          useValue: runtimeAdapter,
        },
      ],
    }).compile();

    const service = moduleRef.get(ExecutionsService);

    const execution = await service.executeTurnCode({
      gameRoomId: 'room-1',
      missionId: 'mission-1',
      turnId: 'turn-1',
      userId: 'user-1',
      containerId: 'container-1',
      command: 'node index.js',
      filePath: '/workspace/index.js',
      content: 'console.log("ok")',
    });

    expect(repository.save).toHaveBeenCalledTimes(3);
    expect(execution.status).toBe(ExecutionStatus.SUCCESS);
    expect(execution.exitCode).toBe(0);
    expect(execution.stdout).toBe('ok');
    expect(execution.startedAt).toBeInstanceOf(Date);
    expect(execution.finishedAt).toBeInstanceOf(Date);
  });

  it('maps runtime failures to FAILED with explicit runtime failure details', async () => {
    const repository = createRepositoryMock();
    const runtimeAdapter = {
      executeMissionCode: jest.fn().mockResolvedValue({
        kind: 'runtime-failure',
        code: 'RUNTIME_WRITE_FAILED',
        message: 'container missing',
        stdout: 'jwt-secret=abc123',
        stderr: 'container missing',
        exitCode: null,
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ExecutionsService,
        {
          provide: getRepositoryToken(ExecutionEntity),
          useValue: repository,
        },
        {
          provide: RUNTIME_ADAPTER,
          useValue: runtimeAdapter,
        },
      ],
    }).compile();

    const service = moduleRef.get(ExecutionsService);

    const execution = await service.executeTurnCode({
      gameRoomId: 'room-1',
      missionId: 'mission-1',
      turnId: 'turn-1',
      userId: 'user-1',
      containerId: 'container-1',
      command: 'node index.js',
      filePath: '/workspace/index.js',
      content: 'console.log("ok")',
      redactionTokens: ['abc123'],
    });

    expect(execution.status).toBe(ExecutionStatus.FAILED);
    expect(execution.runtimeFailureCode).toBe('RUNTIME_WRITE_FAILED');
    expect(execution.runtimeFailureMessage).toBe('container missing');
    expect(execution.stdout).toBe('jwt-secret=[REDACTED]');
    expect(execution.stderr).toBe('container missing');
  });

  it('persists timeout results with TIMEOUT status', async () => {
    const repository = createRepositoryMock();
    const runtimeAdapter = {
      executeMissionCode: jest.fn().mockResolvedValue({
        kind: 'timeout',
        stdout: '',
        stderr: 'killed',
        exitCode: null,
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ExecutionsService,
        {
          provide: getRepositoryToken(ExecutionEntity),
          useValue: repository,
        },
        {
          provide: RUNTIME_ADAPTER,
          useValue: runtimeAdapter,
        },
      ],
    }).compile();

    const service = moduleRef.get(ExecutionsService);

    const execution = await service.executeTurnCode({
      gameRoomId: 'room-1',
      missionId: 'mission-1',
      turnId: 'turn-1',
      userId: 'user-1',
      containerId: 'container-1',
      command: 'node index.js',
      filePath: '/workspace/index.js',
      content: 'console.log("ok")',
      timeoutMs: 5000,
    });

    expect(execution.status).toBe(ExecutionStatus.TIMEOUT);
    expect(execution.timeoutMs).toBe(5000);
    expect(execution.exitCode).toBeNull();
  });

  it('keeps the execution explicit when the runtime adapter rejects', async () => {
    const repository = createRepositoryMock();
    const runtimeAdapter = {
      executeMissionCode: jest.fn().mockRejectedValue(new Error('docker socket unavailable')),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ExecutionsService,
        {
          provide: getRepositoryToken(ExecutionEntity),
          useValue: repository,
        },
        {
          provide: RUNTIME_ADAPTER,
          useValue: runtimeAdapter,
        },
      ],
    }).compile();

    const service = moduleRef.get(ExecutionsService);

    const execution = await service.executeTurnCode({
      gameRoomId: 'room-1',
      missionId: 'mission-1',
      turnId: 'turn-1',
      userId: 'user-1',
      containerId: 'container-1',
      command: 'node /workspace/index.js',
      filePath: '/workspace/index.js',
      content: 'console.log("ok")',
    });

    expect(execution.status).toBe(ExecutionStatus.FAILED);
    expect(execution.runtimeFailureCode).toBe('RUNTIME_EXECUTION_REJECTED');
    expect(execution.runtimeFailureMessage).toBe('docker socket unavailable');
    expect(execution.finishedAt).toBeInstanceOf(Date);
  });
});
