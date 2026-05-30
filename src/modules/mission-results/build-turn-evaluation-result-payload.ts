import { ExecutionEntity } from '@modules/executions/entity/execution.entity';
import { GameRoomMissionStepEntity } from '@modules/game-room-missions/entity/game-room-mission-step.entity';
import { GameRoomMissionEntity } from '@modules/game-room-missions/entity/game-room-mission.entity';
import { GameRoomEntity } from '@modules/game-rooms/entity/game-room.entity';
import { TurnEntity } from '@modules/turns/entity/turn.entity';
import {
  buildPublicCaseFailureMessage,
  resolveFirstFailedPublicCase,
  type PublicTestCaseJudgeDetail,
} from '@modules/turns/judge/step-public-case-judge';
import { MissionResultJudgeStatus } from '@shared/enums';

export interface BuildTurnEvaluationResultPayloadInput {
  judgeStatus: MissionResultJudgeStatus;
  execution: ExecutionEntity;
  publicCaseResults: PublicTestCaseJudgeDetail[] | null;
  room: GameRoomEntity;
  mission: GameRoomMissionEntity;
  turn: TurnEntity;
  currentStep: GameRoomMissionStepEntity | null;
  strikeCount: number;
  missionFinished: boolean;
}

export interface StepJudgingSummary {
  totalCases: number;
  passedCount: number;
  failedCount: number;
  errorCount: number;
}

export interface TurnEvaluationDetectedIssue {
  issueType: 'RUNTIME_ERROR' | 'EXECUTION_FAILED' | 'PUBLIC_TEST_CASE_FAILED';
  message: string;
  filePath: string | null;
  caseName?: string;
}

export function buildTurnEvaluationResultPayload(
  input: BuildTurnEvaluationResultPayloadInput,
): Record<string, unknown> {
  const isStepCleared = input.judgeStatus === MissionResultJudgeStatus.PASSED;
  const stepJudgingSummary = buildStepJudgingSummary(input.publicCaseResults);

  return {
    missionId: input.mission.id,
    turnId: input.turn.id,
    stepId: input.currentStep?.id ?? null,
    stepOrder: input.currentStep?.stepOrder ?? null,
    isStepCleared,
    isMissionCleared: isStepCleared && input.missionFinished,
    judgeStatus: input.judgeStatus,
    strikeCount: input.strikeCount,
    remainingStrikeCount: Math.max(input.room.maxStrikeCount - input.strikeCount, 0),
    feedbackMessage: resolveFeedbackMessage(input.judgeStatus),
    stepJudgingSummary,
    executionSummary: {
      status: input.execution.status,
      exitCode: input.execution.exitCode,
      stdout: input.execution.stdout,
      stderr: input.execution.stderr,
      runtimeFailureCode: input.execution.runtimeFailureCode,
      runtimeFailureMessage: input.execution.runtimeFailureMessage,
    },
    publicCaseResults: input.publicCaseResults,
    detectedIssues: buildDetectedIssues(input),
  };
}

function buildStepJudgingSummary(
  publicCaseResults: PublicTestCaseJudgeDetail[] | null,
): StepJudgingSummary | null {
  if (publicCaseResults === null || publicCaseResults.length === 0) {
    return null;
  }

  return {
    totalCases: publicCaseResults.length,
    passedCount: publicCaseResults.filter((result) => result.outcome === 'PASSED').length,
    failedCount: publicCaseResults.filter((result) => result.outcome === 'FAILED').length,
    errorCount: publicCaseResults.filter((result) => result.outcome === 'ERROR').length,
  };
}

function buildDetectedIssues(
  input: BuildTurnEvaluationResultPayloadInput,
): TurnEvaluationDetectedIssue[] {
  if (input.judgeStatus === MissionResultJudgeStatus.PASSED) {
    return [];
  }

  const filePath = input.currentStep?.missionTemplateStep?.targetFilePath ?? null;

  if (input.publicCaseResults !== null && input.publicCaseResults.length > 0) {
    return input.publicCaseResults
      .filter((result) => result.outcome !== 'PASSED')
      .map((result) => ({
        issueType:
          result.outcome === 'ERROR'
            ? 'RUNTIME_ERROR'
            : 'PUBLIC_TEST_CASE_FAILED',
        caseName: result.name,
        message: buildPublicCaseFailureMessage(result),
        filePath,
      }));
  }

  return [
    {
      issueType:
        input.judgeStatus === MissionResultJudgeStatus.ERROR
          ? 'RUNTIME_ERROR'
          : 'EXECUTION_FAILED',
      message: resolveLegacyDetectedIssueMessage(input),
      filePath,
    },
  ];
}

function resolveLegacyDetectedIssueMessage(
  input: BuildTurnEvaluationResultPayloadInput,
): string {
  const runtimeFailureMessage = input.execution.runtimeFailureMessage?.trim();

  if (runtimeFailureMessage) {
    return runtimeFailureMessage;
  }

  const stderr = input.execution.stderr?.trim();

  if (stderr) {
    return stderr;
  }

  const firstFailedCase = resolveFirstFailedPublicCase(input.publicCaseResults);

  if (firstFailedCase) {
    return buildPublicCaseFailureMessage(firstFailedCase);
  }

  return '판정에 실패했습니다.';
}

function resolveFeedbackMessage(judgeStatus: MissionResultJudgeStatus): string {
  if (judgeStatus === MissionResultJudgeStatus.PASSED) {
    return '현재 미션 단계를 통과했습니다.';
  }

  if (judgeStatus === MissionResultJudgeStatus.FAILED) {
    return '현재 미션 단계를 통과하지 못했습니다.';
  }

  return '런타임 또는 판정 처리 오류가 발생했습니다.';
}
