import { ExecutionEntity } from '@modules/executions/entity/execution.entity';
import { GameRoomMissionStepEntity } from '@modules/game-room-missions/entity/game-room-mission-step.entity';
import { GameRoomMissionEntity } from '@modules/game-room-missions/entity/game-room-mission.entity';
import { GameRoomEntity } from '@modules/game-rooms/entity/game-room.entity';
import { TurnEntity } from '@modules/turns/entity/turn.entity';
import type { PublicTestCaseJudgeDetail } from '@modules/turns/judge/step-public-case-judge';
import { ExecutionStatus, MissionResultJudgeStatus } from '@shared/enums';
import { buildTurnEvaluationResultPayload } from './build-turn-evaluation-result-payload';

describe('buildTurnEvaluationResultPayload', () => {
  it('includes per-case detected issues and step judging summary for public case failures', () => {
    const publicCaseResults: PublicTestCaseJudgeDetail[] = [
      {
        name: 'add_positive_integers',
        stdinLines: ['2', '+', '3'],
        expectedStdout: '5',
        actualStdout: '6',
        stderr: '',
        exitCode: 0,
        executionStatus: ExecutionStatus.SUCCESS,
        runtimeFailureCode: null,
        runtimeFailureMessage: null,
        outcome: 'FAILED',
      },
      {
        name: 'add_negative_integer',
        stdinLines: ['10', '+', '-4'],
        expectedStdout: '6',
        actualStdout: '6',
        stderr: '',
        exitCode: 0,
        executionStatus: ExecutionStatus.SUCCESS,
        runtimeFailureCode: null,
        runtimeFailureMessage: null,
        outcome: 'PASSED',
      },
    ];

    const payload = buildTurnEvaluationResultPayload({
      judgeStatus: MissionResultJudgeStatus.FAILED,
      execution: {
        stdout: '6',
        stderr: '',
        status: ExecutionStatus.SUCCESS,
        exitCode: 0,
        runtimeFailureCode: null,
        runtimeFailureMessage: null,
      } as ExecutionEntity,
      publicCaseResults,
      room: { maxStrikeCount: 3 } as GameRoomEntity,
      mission: { id: 'mission-1' } as GameRoomMissionEntity,
      turn: { id: 'turn-1' } as TurnEntity,
      currentStep: {
        id: 'step-1',
        stepOrder: 1,
        missionTemplateStep: { targetFilePath: 'main.py' },
      } as GameRoomMissionStepEntity,
      strikeCount: 1,
      missionFinished: false,
    });

    expect(payload).toMatchObject({
      stepOrder: 1,
      strikeCount: 1,
      remainingStrikeCount: 2,
      stepJudgingSummary: {
        totalCases: 2,
        passedCount: 1,
        failedCount: 1,
        errorCount: 0,
      },
      detectedIssues: [
        {
          issueType: 'PUBLIC_TEST_CASE_FAILED',
          caseName: 'add_positive_integers',
          message:
            '공개 테스트 "add_positive_integers" 실패: expected "5", actual "6"',
          filePath: 'main.py',
        },
      ],
    });
  });

  it('includes actual runtimeFailureMessage in per-case detected issues for public-case ERROR', () => {
    const publicCaseResults: PublicTestCaseJudgeDetail[] = [
      {
        name: 'add_positive_integers',
        stdinLines: ['2', '+', '3'],
        expectedStdout: '5',
        actualStdout: '',
        stderr: '',
        exitCode: null,
        executionStatus: ExecutionStatus.FAILED,
        runtimeFailureCode: 'RUNTIME_EXECUTION_FAILED',
        runtimeFailureMessage: 'Container exec failed.',
        outcome: 'ERROR',
      },
    ];

    const payload = buildTurnEvaluationResultPayload({
      judgeStatus: MissionResultJudgeStatus.ERROR,
      execution: {
        stdout: '',
        stderr: '',
        status: ExecutionStatus.FAILED,
        exitCode: null,
        runtimeFailureCode: 'RUNTIME_EXECUTION_FAILED',
        runtimeFailureMessage: 'Container exec failed.',
      } as ExecutionEntity,
      publicCaseResults,
      room: { maxStrikeCount: 3 } as GameRoomEntity,
      mission: { id: 'mission-1' } as GameRoomMissionEntity,
      turn: { id: 'turn-1' } as TurnEntity,
      currentStep: {
        id: 'step-1',
        stepOrder: 1,
        missionTemplateStep: { targetFilePath: 'main.py' },
      } as GameRoomMissionStepEntity,
      strikeCount: 0,
      missionFinished: false,
    });

    expect(payload.detectedIssues).toEqual([
      {
        issueType: 'RUNTIME_ERROR',
        caseName: 'add_positive_integers',
        message: 'Container exec failed.',
        filePath: 'main.py',
      },
    ]);
  });

  it('keeps a single runtime issue when judging ends in ERROR without public cases', () => {
    const payload = buildTurnEvaluationResultPayload({
      judgeStatus: MissionResultJudgeStatus.ERROR,
      execution: {
        stdout: '',
        stderr: '',
        status: ExecutionStatus.FAILED,
        exitCode: null,
        runtimeFailureCode: 'RUNTIME_CONTAINER_UNAVAILABLE',
        runtimeFailureMessage: 'Mission runtime container is not available.',
      } as ExecutionEntity,
      publicCaseResults: null,
      room: { maxStrikeCount: 3 } as GameRoomEntity,
      mission: { id: 'mission-1' } as GameRoomMissionEntity,
      turn: { id: 'turn-1' } as TurnEntity,
      currentStep: null,
      strikeCount: 0,
      missionFinished: false,
    });

    expect(payload.detectedIssues).toEqual([
      {
        issueType: 'RUNTIME_ERROR',
        message: 'Mission runtime container is not available.',
        filePath: null,
      },
    ]);
  });
});
