export interface PrepareMissionContainerInput {
  gameRoomId: string;
  missionId: string;
  image: string;
  containerName?: string;
  keepAliveCommand?: string;
}

export interface RuntimeContainerHandle {
  containerId: string;
}

export interface ExecuteMissionCodeInput {
  containerId: string;
  filePath: string;
  content: string;
  command: string;
  timeoutMs?: number;
}

export interface RuntimeExecutionCompletedResult {
  kind: 'completed';
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface RuntimeExecutionTimeoutResult {
  kind: 'timeout';
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export interface RuntimeExecutionFailureResult {
  kind: 'runtime-failure';
  code: string;
  message: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export type RuntimeExecutionResult =
  | RuntimeExecutionCompletedResult
  | RuntimeExecutionTimeoutResult
  | RuntimeExecutionFailureResult;

export interface RuntimeAdapter {
  prepareMissionContainer(
    input: PrepareMissionContainerInput,
  ): Promise<RuntimeContainerHandle>;
  executeMissionCode(
    input: ExecuteMissionCodeInput,
  ): Promise<RuntimeExecutionResult>;
}

export interface CommandRunnerInput {
  command: string;
  args: string[];
  stdin?: string;
  timeoutMs?: number;
}

export interface CommandRunnerResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

export interface RuntimeCommandRunner {
  run(input: CommandRunnerInput): Promise<CommandRunnerResult>;
}
