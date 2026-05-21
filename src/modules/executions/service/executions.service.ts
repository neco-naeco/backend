import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RUNTIME_ADAPTER } from '@integrations/runtime/runtime.constants';
import type { RuntimeAdapter } from '@integrations/runtime/runtime.interfaces';
import { ExecutionStatus } from '@shared/enums';
import { ExecutionEntity } from '../entity/execution.entity';

export interface StartExecutionInput {
  gameRoomId: string;
  missionId: string;
  turnId: string;
  userId: string;
  containerId: string;
  command: string;
  filePath: string;
  content: string;
  timeoutMs?: number;
  redactionTokens?: string[];
}

@Injectable()
export class ExecutionsService {
  constructor(
    @InjectRepository(ExecutionEntity)
    private readonly executionsRepository: Repository<ExecutionEntity>,
    @Inject(RUNTIME_ADAPTER)
    private readonly runtimeAdapter: RuntimeAdapter,
  ) {}

  async executeTurnCode(input: StartExecutionInput): Promise<ExecutionEntity> {
    const execution = this.executionsRepository.create({
      gameRoomId: input.gameRoomId,
      missionId: input.missionId,
      turnId: input.turnId,
      userId: input.userId,
      containerId: input.containerId,
      command: input.command,
      timeoutMs: input.timeoutMs ?? null,
      status: ExecutionStatus.PENDING,
      stdout: null,
      stderr: null,
      exitCode: null,
      runtimeFailureCode: null,
      runtimeFailureMessage: null,
      startedAt: null,
      finishedAt: null,
    });

    await this.executionsRepository.save(execution);

    execution.status = ExecutionStatus.RUNNING;
    execution.startedAt = new Date();
    await this.executionsRepository.save(execution);

    let runtimeResult;

    try {
      runtimeResult = await this.runtimeAdapter.executeMissionCode({
        containerId: input.containerId,
        filePath: input.filePath,
        content: input.content,
        command: input.command,
        timeoutMs: input.timeoutMs,
      });
    } catch (error) {
      execution.stdout = '';
      execution.stderr = '';
      execution.exitCode = null;
      execution.finishedAt = new Date();
      execution.status = ExecutionStatus.FAILED;
      execution.runtimeFailureCode = 'RUNTIME_EXECUTION_REJECTED';
      execution.runtimeFailureMessage =
        error instanceof Error ? error.message : 'Unknown runtime rejection';

      return this.executionsRepository.save(execution);
    }

    execution.stdout = redactSecrets(runtimeResult.stdout, input.redactionTokens);
    execution.stderr = redactSecrets(runtimeResult.stderr, input.redactionTokens);
    execution.finishedAt = new Date();

    if (runtimeResult.kind === 'completed') {
      execution.exitCode = runtimeResult.exitCode;
      execution.status =
        runtimeResult.exitCode === 0 ? ExecutionStatus.SUCCESS : ExecutionStatus.FAILED;
      execution.runtimeFailureCode = null;
      execution.runtimeFailureMessage = null;
    } else if (runtimeResult.kind === 'timeout') {
      execution.exitCode = runtimeResult.exitCode;
      execution.status = ExecutionStatus.TIMEOUT;
      execution.runtimeFailureCode = null;
      execution.runtimeFailureMessage = null;
    } else {
      execution.exitCode = runtimeResult.exitCode;
      execution.status = ExecutionStatus.FAILED;
      execution.runtimeFailureCode = runtimeResult.code;
      execution.runtimeFailureMessage = runtimeResult.message;
    }

    return this.executionsRepository.save(execution);
  }
}

function redactSecrets(value: string, redactionTokens?: string[]): string {
  if (redactionTokens === undefined || redactionTokens.length === 0) {
    return value;
  }

  return redactionTokens.reduce((sanitized, token) => {
    if (token.length === 0) {
      return sanitized;
    }

    return sanitized.split(token).join('[REDACTED]');
  }, value);
}
