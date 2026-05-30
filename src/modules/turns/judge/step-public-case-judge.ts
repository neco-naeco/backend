import { ExecutionEntity } from '@modules/executions/entity/execution.entity';
import { ExecutionStatus, MissionResultJudgeStatus } from '@shared/enums';

export interface PublicTestCase {
  name: string;
  stdinLines: string[];
  expectedStdout: string;
}

export interface PublicTestCaseJudgeDetail {
  name: string;
  stdinLines: string[];
  expectedStdout: string;
  actualStdout: string;
  stderr: string;
  exitCode: number | null;
  executionStatus: ExecutionStatus;
  runtimeFailureCode: string | null;
  runtimeFailureMessage: string | null;
  outcome: PublicTestCaseOutcome;
}

export type PublicTestCaseOutcome = 'PASSED' | 'FAILED' | 'ERROR';

export interface StepPublicCaseJudgeOutcome {
  judgeStatus: MissionResultJudgeStatus;
  representativeExecution: ExecutionEntity;
  caseResults: PublicTestCaseJudgeDetail[];
}

export function resolveStepPublicTestCases(
  judgePolicyJson: Record<string, unknown>,
  stepOrder: number,
): PublicTestCase[] | null {
  const steps = judgePolicyJson.steps;

  if (!Array.isArray(steps)) {
    return null;
  }

  const stepBundle = steps.find(
    (step): step is Record<string, unknown> =>
      isRecord(step) && asNumber(step.stepOrder) === stepOrder,
  );

  if (!stepBundle) {
    return null;
  }

  const rawCases = stepBundle.testCases;

  if (!Array.isArray(rawCases) || rawCases.length === 0) {
    return null;
  }

  const testCases = rawCases
    .map(parsePublicTestCase)
    .filter((testCase): testCase is PublicTestCase => testCase !== null);

  return testCases.length > 0 ? testCases : null;
}

export function evaluatePublicTestCaseExecution(
  execution: ExecutionEntity,
  expectedStdout: string,
): PublicTestCaseOutcome {
  if (execution.runtimeFailureCode !== null) {
    return 'ERROR';
  }

  const actualStdout = (execution.stdout ?? '').trim();
  const stderr = (execution.stderr ?? '').trim();

  if (
    execution.status === ExecutionStatus.SUCCESS &&
    execution.exitCode === 0 &&
    stderr.length === 0 &&
    actualStdout === expectedStdout
  ) {
    return 'PASSED';
  }

  return 'FAILED';
}

export function aggregatePublicCaseOutcomes(
  outcomes: PublicTestCaseOutcome[],
): MissionResultJudgeStatus {
  if (outcomes.includes('ERROR')) {
    return MissionResultJudgeStatus.ERROR;
  }

  if (outcomes.includes('FAILED')) {
    return MissionResultJudgeStatus.FAILED;
  }

  return MissionResultJudgeStatus.PASSED;
}

export function selectRepresentativeExecution(
  caseResults: PublicTestCaseJudgeDetail[],
  executions: ExecutionEntity[],
): ExecutionEntity {
  const firstFailureIndex = caseResults.findIndex((result) => result.outcome !== 'PASSED');

  if (firstFailureIndex >= 0) {
    return executions[firstFailureIndex];
  }

  return executions[executions.length - 1];
}

export function buildPublicCaseFailureMessage(
  caseResult: PublicTestCaseJudgeDetail,
): string {
  if (caseResult.outcome === 'ERROR') {
    return resolvePublicCaseErrorMessage(caseResult);
  }

  const actualStdout = caseResult.actualStdout.trim();

  return `공개 테스트 "${caseResult.name}" 실패: expected "${caseResult.expectedStdout}", actual "${actualStdout}"`;
}

export function resolvePublicCaseErrorMessage(
  caseResult: Pick<
    PublicTestCaseJudgeDetail,
    'name' | 'stderr' | 'runtimeFailureMessage'
  >,
): string {
  const runtimeFailureMessage = caseResult.runtimeFailureMessage?.trim();

  if (runtimeFailureMessage) {
    return runtimeFailureMessage;
  }

  const stderr = caseResult.stderr?.trim();

  if (stderr) {
    return stderr;
  }

  return `공개 테스트 "${caseResult.name}" 런타임 오류`;
}

export function resolveFirstFailedPublicCase(
  caseResults: PublicTestCaseJudgeDetail[] | null,
): PublicTestCaseJudgeDetail | null {
  if (caseResults === null) {
    return null;
  }

  return (
    caseResults.find((result) => result.outcome === 'ERROR') ??
    caseResults.find((result) => result.outcome === 'FAILED') ??
    null
  );
}

export async function runStepPublicCaseJudging(
  testCases: PublicTestCase[],
  executeCase: (testCase: PublicTestCase) => Promise<ExecutionEntity>,
): Promise<StepPublicCaseJudgeOutcome> {
  const caseResults: PublicTestCaseJudgeDetail[] = [];
  const outcomes: PublicTestCaseOutcome[] = [];
  const executions: ExecutionEntity[] = [];

  for (const testCase of testCases) {
    const execution = await executeCase(testCase);
    const outcome = evaluatePublicTestCaseExecution(execution, testCase.expectedStdout);

    executions.push(execution);
    caseResults.push({
      name: testCase.name,
      stdinLines: testCase.stdinLines,
      expectedStdout: testCase.expectedStdout,
      actualStdout: execution.stdout ?? '',
      stderr: execution.stderr ?? '',
      exitCode: execution.exitCode,
      executionStatus: execution.status,
      runtimeFailureCode: execution.runtimeFailureCode,
      runtimeFailureMessage: execution.runtimeFailureMessage,
      outcome,
    });
    outcomes.push(outcome);
  }

  const judgeStatus = aggregatePublicCaseOutcomes(outcomes);

  return {
    judgeStatus,
    representativeExecution: selectRepresentativeExecution(caseResults, executions),
    caseResults,
  };
}

function parsePublicTestCase(value: unknown): PublicTestCase | null {
  if (!isRecord(value)) {
    return null;
  }

  const name = asString(value.name);
  const expectedStdout = asString(value.expectedStdout);
  const stdinLines = Array.isArray(value.stdinLines)
    ? value.stdinLines.filter((line): line is string => typeof line === 'string')
    : null;

  if (!name || !expectedStdout || stdinLines === null) {
    return null;
  }

  return {
    name,
    stdinLines,
    expectedStdout,
  };
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
