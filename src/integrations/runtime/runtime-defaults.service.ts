import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import type {
  CommandRunnerInput,
  CommandRunnerResult,
  ExecuteMissionCodeInput,
  PrepareMissionContainerInput,
  RuntimeAdapter,
  RuntimeCommandRunner,
  RuntimeContainerHandle,
  RuntimeExecutionResult,
} from './runtime.interfaces';

@Injectable()
export class DockerCliCommandRunner implements RuntimeCommandRunner {
  async run(input: CommandRunnerInput): Promise<CommandRunnerResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(input.command, input.args, {
        stdio: 'pipe',
      });

      let stdout = '';
      let stderr = '';
      let settled = false;
      let timedOut = false;

      const timeoutId =
        input.timeoutMs === undefined
          ? undefined
          : setTimeout(() => {
              timedOut = true;
              child.kill('SIGKILL');
            }, input.timeoutMs);

      child.stdout.on('data', (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      child.on('error', (error) => {
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
        }

        if (!settled) {
          settled = true;
          reject(error);
        }
      });

      child.on('close', (code) => {
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
        }

        if (!settled) {
          settled = true;
          resolve({
            stdout,
            stderr,
            exitCode: code,
            timedOut,
          });
        }
      });

      if (input.stdin !== undefined) {
        child.stdin.write(input.stdin);
      }

      child.stdin.end();
    });
  }
}

@Injectable()
export class DockerRuntimeAdapter implements RuntimeAdapter {
  constructor(
    private readonly configService: ConfigService,
    private readonly commandRunner: DockerCliCommandRunner,
  ) {}

  async prepareMissionContainer(
    input: PrepareMissionContainerInput,
  ): Promise<RuntimeContainerHandle> {
    const containerName =
      input.containerName ??
      `neco-runtime-${input.gameRoomId}-${input.missionId}`.toLowerCase();
    const keepAliveCommand = input.keepAliveCommand ?? 'tail -f /dev/null';

    const result = await this.commandRunner.run({
      command: 'docker',
      args: [
        'run',
        '-d',
        '--cpus',
        this.configService.get<string>('runtime.containerCpus') ?? '0.5',
        '--memory',
        this.configService.get<string>('runtime.containerMemory') ?? '256m',
        '--network',
        'none',
        '--read-only',
        '--tmpfs',
        '/tmp',
        '--tmpfs',
        '/workspace',
        '--name',
        containerName,
        '--label',
        `neco.game_room_id=${input.gameRoomId}`,
        '--label',
        `neco.mission_id=${input.missionId}`,
        input.image,
        'sh',
        '-lc',
        keepAliveCommand,
      ],
    });

    if (result.timedOut) {
      throw new Error('Docker runtime container preparation timed out');
    }

    if (result.exitCode !== 0) {
      throw new Error(result.stderr || 'Docker runtime container preparation failed');
    }

    return {
      containerId: result.stdout.trim(),
    };
  }

  async executeMissionCode(
    input: ExecuteMissionCodeInput,
  ): Promise<RuntimeExecutionResult> {
    if (!isWritableRuntimePath(input.filePath)) {
      return {
        kind: 'runtime-failure',
        code: 'RUNTIME_FILE_PATH_NOT_WRITABLE',
        message: `Runtime file path must be inside /tmp or /workspace: ${input.filePath}`,
        stdout: '',
        stderr: '',
        exitCode: null,
      };
    }

    try {
      const writeResult = await this.commandRunner.run({
        command: 'docker',
        args: [
          'exec',
          '-i',
          input.containerId,
          'sh',
          '-lc',
          `cat > '${escapeShellPath(input.filePath)}'`,
        ],
        stdin: input.content,
      });

      if (writeResult.exitCode !== 0 || writeResult.timedOut) {
        return {
          kind: 'runtime-failure',
          code: writeResult.timedOut ? 'RUNTIME_WRITE_TIMEOUT' : 'RUNTIME_WRITE_FAILED',
          message: writeResult.stderr || 'Failed to write mission code into runtime container',
          stdout: writeResult.stdout,
          stderr: writeResult.stderr,
          exitCode: writeResult.exitCode,
        };
      }

      const execResult = await this.commandRunner.run({
        command: 'docker',
        args: ['exec', input.containerId, 'sh', '-lc', input.command],
        timeoutMs:
          input.timeoutMs ??
          this.configService.get<number>('runtime.executionTimeoutMs') ??
          10000,
      });

      if (execResult.timedOut) {
        return {
          kind: 'timeout',
          stdout: execResult.stdout,
          stderr: execResult.stderr,
          exitCode: execResult.exitCode,
        };
      }

      return {
        kind: 'completed',
        stdout: execResult.stdout,
        stderr: execResult.stderr,
        exitCode: execResult.exitCode ?? 1,
      };
    } catch (error) {
      return {
        kind: 'runtime-failure',
        code: 'RUNTIME_EXECUTION_FAILED',
        message: error instanceof Error ? error.message : 'Unknown runtime failure',
        stdout: '',
        stderr: '',
        exitCode: null,
      };
    }
  }
}

function escapeShellPath(filePath: string): string {
  return filePath.replace(/'/g, `'\\''`);
}

function isWritableRuntimePath(filePath: string): boolean {
  return filePath.startsWith('/tmp/') || filePath.startsWith('/workspace/');
}
