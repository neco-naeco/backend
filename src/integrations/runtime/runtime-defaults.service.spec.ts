import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import runtimeConfig from '@common/config/runtime.config';
import { DockerCliCommandRunner, DockerRuntimeAdapter } from './runtime-defaults.service';

describe('DockerRuntimeAdapter', () => {
  it('prepares a sibling container with the configured runtime limits', async () => {
    const runner = {
      run: jest.fn().mockResolvedValue({
        stdout: 'container-123\n',
        stderr: '',
        exitCode: 0,
        timedOut: false,
      }),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [runtimeConfig] })],
      providers: [
        DockerRuntimeAdapter,
        {
          provide: DockerCliCommandRunner,
          useValue: runner,
        },
      ],
    }).compile();

    const adapter = moduleRef.get(DockerRuntimeAdapter);

    await expect(
      adapter.prepareMissionContainer({
        gameRoomId: 'room-1',
        missionId: 'mission-1',
        image: 'mission-runner:latest',
      }),
    ).resolves.toEqual({
      containerId: 'container-123',
    });

    expect(runner.run).toHaveBeenCalledWith({
      command: 'docker',
      args: [
        'run',
        '-d',
        '--cpus',
        '0.5',
        '--memory',
        '256m',
        '--network',
        'none',
        '--read-only',
        '--tmpfs',
        '/tmp',
        '--tmpfs',
        '/workspace',
        '--name',
        'neco-runtime-room-1-mission-1',
        '--label',
        'neco.game_room_id=room-1',
        '--label',
        'neco.mission_id=mission-1',
        'mission-runner:latest',
        'sh',
        '-lc',
        'tail -f /dev/null',
      ],
    });
  });

  it('maps runtime write failures without pretending the execution succeeded', async () => {
    const runner = {
      run: jest
        .fn()
        .mockResolvedValueOnce({
          stdout: '',
          stderr: 'permission denied',
          exitCode: 1,
          timedOut: false,
        }),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [runtimeConfig] })],
      providers: [
        DockerRuntimeAdapter,
        {
          provide: DockerCliCommandRunner,
          useValue: runner,
        },
      ],
    }).compile();

    const adapter = moduleRef.get(DockerRuntimeAdapter);

    await expect(
      adapter.executeMissionCode({
        containerId: 'container-123',
        filePath: '/workspace/index.js',
        content: 'console.log("hi")',
        command: 'node /workspace/index.js',
      }),
    ).resolves.toEqual({
      kind: 'runtime-failure',
      code: 'RUNTIME_WRITE_FAILED',
      message: 'permission denied',
      stdout: '',
      stderr: 'permission denied',
      exitCode: 1,
    });
  });

  it('rejects file paths outside the writable tmpfs mounts before docker exec runs', async () => {
    const runner = {
      run: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [runtimeConfig] })],
      providers: [
        DockerRuntimeAdapter,
        {
          provide: DockerCliCommandRunner,
          useValue: runner,
        },
      ],
    }).compile();

    const adapter = moduleRef.get(DockerRuntimeAdapter);

    await expect(
      adapter.executeMissionCode({
        containerId: 'container-123',
        filePath: '/app/index.js',
        content: 'console.log("hi")',
        command: 'node /app/index.js',
      }),
    ).resolves.toEqual({
      kind: 'runtime-failure',
      code: 'RUNTIME_FILE_PATH_NOT_WRITABLE',
      message: 'Runtime file path must be inside /tmp or /workspace: /app/index.js',
      stdout: '',
      stderr: '',
      exitCode: null,
    });
    expect(runner.run).not.toHaveBeenCalled();
  });
});
