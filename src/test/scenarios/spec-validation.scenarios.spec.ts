/**
 * Document-driven scenario checks from docs/specs/08-security-testing-and-delivery.md.
 * Uses the same mocked-repository service test style as module unit specs.
 */

import { ConfigService } from '@nestjs/config';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { GameRoomEntity } from '@modules/game-rooms/entity/game-room.entity';
import { GameRoomsService } from '@modules/game-rooms/service/game-rooms.service';
import { GameRoomMissionsService } from '@modules/game-room-missions/service/game-room-missions.service';
import { GameRoomParticipantEntity } from '@modules/game-room-participants/entity/game-room-participant.entity';
import { GameRoomParticipantsService } from '@modules/game-room-participants/service/game-room-participants.service';
import { GameRoomMissionStepEntity } from '@modules/game-room-missions/entity/game-room-mission-step.entity';
import { GameRoomMissionEntity } from '@modules/game-room-missions/entity/game-room-mission.entity';
import { ExecutionsService } from '@modules/executions/service/executions.service';
import { MissionResultsService } from '@modules/mission-results/service/mission-results.service';
import { TurnEntity } from '@modules/turns/entity/turn.entity';
import { TurnSnapshotEntity } from '@modules/turns/entity/turn-snapshot.entity';
import { TurnsService } from '@modules/turns/service/turns.service';
import { DatabaseRealtimeRoomAccessService } from '@modules/realtime/service/realtime-room-access.service';
import { DatabaseRealtimeDisconnectService } from '@modules/realtime/service/realtime-disconnect.service';
import { DefaultRealtimeTurnSubmitService } from '@modules/realtime/service/realtime-defaults.service';
import { RealtimeRoomStateService } from '@modules/realtime/service/realtime-room-state.service';
import {
  ExecutionStatus,
  GameRoomMissionStepStatus,
  GameRoomParticipantMembershipStatus,
  GameRoomStatus,
  MissionResultJudgeStatus,
  TurnStatus,
} from '@shared/enums';
import { ExecutionEntity } from '@modules/executions/entity/execution.entity';
import type { TurnLifecycleResult } from '@modules/turns/service/turns.service';

describe('Spec validation scenarios (docs/specs/08-security-testing-and-delivery.md)', () => {
  describe('authorization failure paths', () => {
    it('blocks room access for non-members', async () => {
      const participantRepository = {
        findOne: jest.fn().mockResolvedValue(null),
      };
      const roomAccessService = new DatabaseRealtimeRoomAccessService(
        {
          getRepository: jest.fn().mockReturnValue(participantRepository),
        } as unknown as DataSource,
        {
          buildParticipantsUpdatedEvent: jest.fn(),
        } as unknown as RealtimeRoomStateService,
      );

      await expect(
        roomAccessService.getJoinRoomState({
          gameRoomId: 'room-1',
          userId: 'outsider',
        }),
      ).rejects.toMatchObject({
        response: { code: 'GAME_ROOM_ACCESS_FORBIDDEN' },
      });
    });

    it('blocks game start for non-owners', async () => {
      const roomRepository = {
        findOne: jest.fn().mockResolvedValue({
          id: 'room-1',
          ownerUserId: 'owner-1',
          status: GameRoomStatus.WAITING,
          difficulty: 'EASY',
          minParticipants: 2,
          maxParticipants: 4,
        } as GameRoomEntity),
      };
      const participantRepository = {
        findOne: jest.fn().mockResolvedValue(null),
        count: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
        find: jest.fn(),
      };
      const manager = {
        getRepository: jest.fn((entity: unknown) =>
          entity === GameRoomEntity ? roomRepository : participantRepository,
        ),
        query: jest.fn(),
      };
      const gameRoomsService = new GameRoomsService(
        {
          transaction: jest.fn(async (callback) => callback(manager)),
        } as unknown as DataSource,
        {} as GameRoomMissionsService,
        {} as TurnsService,
      );

      await expect(
        gameRoomsService.startGame({
          actorUserId: 'guest',
          gameRoomId: 'room-1',
          missionTemplateId: 'template-1',
        }),
      ).rejects.toMatchObject({
        response: { code: 'GAME_ROOM_OWNER_REQUIRED' },
      });
    });

    it('blocks invitation acceptance by a non-invited user', async () => {
      const participantRepository = {
        findOne: jest.fn().mockResolvedValue({
          id: 'participant-1',
          userId: 'invitee-1',
          gameRoomId: 'room-1',
          membershipStatus: GameRoomParticipantMembershipStatus.INVITED,
          gameRoom: {
            id: 'room-1',
            status: GameRoomStatus.WAITING,
          },
        } as GameRoomParticipantEntity),
        count: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
        find: jest.fn(),
      };
      const roomRepository = {
        findOne: jest.fn(),
      };
      const manager = {
        getRepository: jest.fn((entity: unknown) =>
          entity === GameRoomEntity ? roomRepository : participantRepository,
        ),
        query: jest.fn(),
      };
      const participantsService = new GameRoomParticipantsService({
        transaction: jest.fn(async (callback) => callback(manager)),
      } as never);

      await expect(
        participantsService.acceptInvitation({
          actorUserId: 'other-user',
          participantId: 'participant-1',
        }),
      ).rejects.toMatchObject({
        response: { code: 'INVITED_USER_REQUIRED' },
      });
    });

    it('blocks turn submit for non-current players', async () => {
      const room = createScenarioRoom();
      const mission = createScenarioMission();
      const currentStep = createScenarioCurrentStep();
      const turn = createScenarioTurn();
      const manager = createScenarioTurnManager({
        room,
        mission,
        currentStep,
        turn,
        participants: createScenarioParticipants(),
        snapshots: [],
        turns: [turn],
      });
      const turnsService = new TurnsService(
        { get: jest.fn().mockReturnValue(10000) } as unknown as ConfigService,
        {
          transaction: jest.fn(async (callback: (m: EntityManager) => unknown) =>
            callback(manager as unknown as EntityManager),
          ),
        } as unknown as DataSource,
        {} as GameRoomMissionsService,
        {} as ExecutionsService,
        {} as MissionResultsService,
      );

      await expect(
        turnsService.submitTurn({
          gameRoomId: room.id,
          turnId: turn.id,
          userId: 'user-2',
          occurredAt: '2026-05-27T10:00:10+09:00',
          files: [],
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('duplicate submit handling', () => {
    it('ignores only TURN_NOT_IN_PROGRESS conflicts during realtime submit', async () => {
      const turnsService: jest.Mocked<Pick<TurnsService, 'submitTurn'>> = {
        submitTurn: jest
          .fn()
          .mockRejectedValueOnce(
            new ConflictException({
              code: 'TURN_NOT_IN_PROGRESS',
              message: 'Only an in-progress turn can be finished.',
            }),
          )
          .mockRejectedValueOnce(
            new ConflictException({
              code: 'TURN_PLAYER_REQUIRED',
              message: 'No joined participant is available for the next turn.',
            }),
          ),
      };
      const publishTurnLifecycleResult = jest.fn();
      const submitService = new DefaultRealtimeTurnSubmitService(
        turnsService as unknown as TurnsService,
        { publishTurnLifecycleResult } as never,
      );
      const request = {
        gameRoomId: 'room-1',
        turnId: 'turn-1',
        userId: 'user-1',
        occurredAt: '2026-05-27T10:00:00+09:00',
        files: [],
      };

      await expect(submitService.submitTurn(request)).resolves.toBeUndefined();
      await expect(submitService.submitTurn(request)).rejects.toMatchObject({
        response: { code: 'TURN_PLAYER_REQUIRED' },
      });
      expect(publishTurnLifecycleResult).not.toHaveBeenCalled();
    });
  });

  describe('reconnect policy (MVP)', () => {
    it('marks LEFT, times out without next turn, then finishes the room when below minParticipants', async () => {
      const room = createScenarioRoom();
      const mission = createScenarioMission();
      const currentStep = createScenarioCurrentStep();
      const turn = createScenarioTurn();
      const participants = createScenarioParticipants();
      const snapshots: TurnSnapshotEntity[] = [];
      const turns = [turn];
      const manager = createScenarioTurnManager({
        room,
        mission,
        currentStep,
        turn,
        participants,
        snapshots,
        turns,
      });
      const turnsDataSource = {
        transaction: jest.fn(async (callback: (m: EntityManager) => unknown) =>
          callback(manager as unknown as EntityManager),
        ),
      } as unknown as DataSource;
      const turnsService = new TurnsService(
        { get: jest.fn().mockReturnValue(10000) } as unknown as ConfigService,
        turnsDataSource,
        {
          completeCurrentStep: jest.fn(),
          recordFailedAttempt: jest.fn().mockResolvedValue({
            mission: { ...mission, strikeCount: 1 },
            currentStep,
            missionFinished: false,
          }),
          transitionCurrentStepToInProgress: jest.fn(),
        } as unknown as GameRoomMissionsService,
        {
          executeTurnCode: jest.fn().mockResolvedValue({
            id: 'execution-1',
            status: ExecutionStatus.FAILED,
            exitCode: 1,
            stdout: '',
            stderr: 'failed',
            runtimeFailureCode: null,
            runtimeFailureMessage: null,
          }),
        } as unknown as ExecutionsService,
        {
          createMissionResult: jest.fn().mockResolvedValue({}),
        } as unknown as MissionResultsService,
      );

      const gameRoomParticipantsService: jest.Mocked<
        Pick<GameRoomParticipantsService, 'markJoinedParticipantLeftOnDisconnect'>
      > = {
        markJoinedParticipantLeftOnDisconnect: jest.fn().mockResolvedValue({
          membershipChanged: true,
          joinedParticipantCount: 1,
          room,
        }),
      };
      const gameRoomsService: jest.Mocked<
        Pick<GameRoomsService, 'finishRoomIfBelowMinParticipants'>
      > = {
        finishRoomIfBelowMinParticipants: jest.fn().mockImplementation(async () => {
          room.status = GameRoomStatus.FINISHED;
          return {
            finished: true,
            room,
          };
        }),
      };
      const publishRoomParticipantsUpdated = jest.fn();
      const publishedLifecycle: { current: TurnLifecycleResult | null } = {
        current: null,
      };
      const publishedGameStates: Array<{ gameState: Record<string, unknown> }> = [];
      const publishTurnLifecycleResult = jest
        .fn()
        .mockImplementation(
          async (
            result: TurnLifecycleResult,
            options?: { omitGameStateUpdated?: boolean },
          ) => {
            publishedLifecycle.current = result;

            if (!options?.omitGameStateUpdated) {
              publishedGameStates.push(result.gameStateUpdatedEvent);
            }
          },
        );
      const publishTurnChanged = jest.fn();
      const publishGameStateUpdated = jest.fn().mockImplementation(async (event) => {
        publishedGameStates.push(event);
      });
      const disconnectService = new DatabaseRealtimeDisconnectService(
        {
          getRepository: jest.fn().mockReturnValue({
            findOne: jest.fn(async () =>
              turns.find((candidate) => candidate.status === TurnStatus.IN_PROGRESS) ??
              null,
            ),
          }),
        } as unknown as DataSource,
        gameRoomParticipantsService as unknown as GameRoomParticipantsService,
        gameRoomsService as unknown as GameRoomsService,
        turnsService,
        {
          buildParticipantsUpdatedEvent: jest.fn().mockResolvedValue({
            gameRoomId: room.id,
            participants: [],
            changedParticipant: null,
            gameState: { status: GameRoomStatus.FINISHED },
            missionState: null,
            occurredAt: '2026-05-27T10:00:00+09:00',
          }),
        } as unknown as RealtimeRoomStateService,
        {
          publishRoomParticipantsUpdated,
          publishTurnLifecycleResult,
          publishTurnChanged,
          publishGameStateUpdated,
        } as never,
        {
          listLatestFileContents: jest.fn().mockResolvedValue([
            {
              gameRoomId: room.id,
              turnId: turn.id,
              userId: turn.playerUserId,
              filePath: 'main.py',
              content: 'print("timeout")\n',
              occurredAt: '2026-05-27T10:00:00+09:00',
            },
          ]),
        } as never,
      );

      await disconnectService.handleDisconnect({
        gameRoomId: room.id,
        userId: turn.playerUserId,
      });

      expect(turn.status).toBe(TurnStatus.TIMEOUT);
      expect(turns).toHaveLength(1);
      expect(publishedLifecycle.current).not.toBeNull();
      expect(publishedLifecycle.current?.turnChangedEvent).toBeNull();
      expect(publishTurnLifecycleResult).toHaveBeenCalledWith(
        expect.anything(),
        { omitGameStateUpdated: true },
      );
      expect(publishTurnChanged).not.toHaveBeenCalled();
      expect(gameRoomsService.finishRoomIfBelowMinParticipants).toHaveBeenCalledWith(
        room.id,
      );
      expect(room.status).toBe(GameRoomStatus.FINISHED);
      expect(publishedGameStates).toHaveLength(1);
      expect(publishedGameStates[0]?.gameState).toMatchObject({
        status: GameRoomStatus.FINISHED,
      });
      expect(
        publishedGameStates.some(
          (event) => event.gameState.status === GameRoomStatus.IN_PROGRESS,
        ),
      ).toBe(false);
    });
  });

  describe('calculator mission public-case judging (docs/plans/calculator-mission-template-runtime-judging-plan.md)', () => {
    it('passes a calculator step and publishes turn-evaluated with per-case results', async () => {
      const { service, missionResultsService, publishTurnLifecycleResult } =
        createCalculatorTurnsHarness({
          executions: [
            {
              status: ExecutionStatus.SUCCESS,
              exitCode: 0,
              stdout: '5',
              stderr: '',
              runtimeFailureCode: null,
              runtimeFailureMessage: null,
            },
            {
              status: ExecutionStatus.SUCCESS,
              exitCode: 0,
              stdout: '6',
              stderr: '',
              runtimeFailureCode: null,
              runtimeFailureMessage: null,
            },
          ],
          missionHandlers: {
            completeCurrentStep: jest.fn().mockResolvedValue({
              mission: { id: 'mission-1', currentStepId: 'step-2', strikeCount: 0 },
              nextStep: { id: 'step-2', stepOrder: 2 },
              missionFinished: false,
            }),
            transitionCurrentStepToInProgress: jest.fn(),
          },
        });

      const lifecycle = await submitCalculatorTurn(service, publishTurnLifecycleResult);

      expect(lifecycle.evaluatedEvent.evaluationResult).toMatchObject({
        judgeStatus: MissionResultJudgeStatus.PASSED,
        stepOrder: 1,
        stepJudgingSummary: {
          totalCases: 2,
          passedCount: 2,
          failedCount: 0,
          errorCount: 0,
        },
        publicCaseResults: expect.arrayContaining([
          expect.objectContaining({ name: 'add_positive_integers', outcome: 'PASSED' }),
        ]),
      });
      expect(missionResultsService.createMissionResult).toHaveBeenCalledWith(
        expect.objectContaining({
          judgeStatus: MissionResultJudgeStatus.PASSED,
        }),
      );
      expect(lifecycle.turnChangedEvent).not.toBeNull();
    });

    it('increments strike and explains stdout mismatch without AI judgment', async () => {
      const { service, missionResultsService, publishTurnLifecycleResult } =
        createCalculatorTurnsHarness({
          executions: [
            {
              status: ExecutionStatus.SUCCESS,
              exitCode: 0,
              stdout: '6',
              stderr: '',
              runtimeFailureCode: null,
              runtimeFailureMessage: null,
            },
            {
              status: ExecutionStatus.SUCCESS,
              exitCode: 0,
              stdout: '6',
              stderr: '',
              runtimeFailureCode: null,
              runtimeFailureMessage: null,
            },
          ],
          missionHandlers: {
            recordFailedAttempt: jest.fn().mockResolvedValue({
              mission: { id: 'mission-1', strikeCount: 1 },
              currentStep: createCalculatorScenarioCurrentStep(1),
              missionFinished: false,
            }),
            transitionCurrentStepToInProgress: jest.fn(),
          },
        });

      const lifecycle = await submitCalculatorTurn(service, publishTurnLifecycleResult);

      expect(lifecycle.evaluatedEvent.evaluationResult).toMatchObject({
        judgeStatus: MissionResultJudgeStatus.FAILED,
        strikeCount: 1,
        detectedIssues: [
          expect.objectContaining({
            issueType: 'PUBLIC_TEST_CASE_FAILED',
            caseName: 'add_positive_integers',
          }),
        ],
      });
      expect(missionResultsService.createMissionResult).toHaveBeenCalled();
    });

    it('passes unsupported-operator calculator contracts on step 5', async () => {
      const { service, publishTurnLifecycleResult } = createCalculatorTurnsHarness({
        stepOrder: 5,
        testCases: [
          {
            name: 'unsupported_operator',
            stdinLines: ['8', '%', '3'],
            expectedStdout: 'ERROR: unsupported operator',
          },
        ],
        executions: [
          {
            status: ExecutionStatus.SUCCESS,
            exitCode: 0,
            stdout: 'ERROR: unsupported operator',
            stderr: '',
            runtimeFailureCode: null,
            runtimeFailureMessage: null,
          },
        ],
        missionHandlers: {
          completeCurrentStep: jest.fn().mockResolvedValue({
            mission: { id: 'mission-1', strikeCount: 0 },
            nextStep: { id: 'step-6', stepOrder: 6 },
            missionFinished: false,
          }),
          transitionCurrentStepToInProgress: jest.fn(),
        },
      });

      const lifecycle = await submitCalculatorTurn(service, publishTurnLifecycleResult);

      expect(lifecycle.evaluatedEvent.evaluationResult).toMatchObject({
        judgeStatus: MissionResultJudgeStatus.PASSED,
        publicCaseResults: [
          expect.objectContaining({
            name: 'unsupported_operator',
            outcome: 'PASSED',
          }),
        ],
      });
    });

    it('keeps runtime ERROR explicit without strike increment or next turn', async () => {
      const { service, missionResultsService, publishTurnLifecycleResult, missionHandlers } =
        createCalculatorTurnsHarness({
          testCases: [
            {
              name: 'add_positive_integers',
              stdinLines: ['2', '+', '3'],
              expectedStdout: '5',
            },
          ],
          executions: [
            {
              status: ExecutionStatus.FAILED,
              exitCode: null,
              stdout: '',
              stderr: '',
              runtimeFailureCode: 'RUNTIME_EXECUTION_FAILED',
              runtimeFailureMessage: 'Container exec failed.',
            },
          ],
          missionHandlers: {
            recordFailedAttempt: jest.fn(),
            completeCurrentStep: jest.fn(),
            transitionCurrentStepToInProgress: jest.fn(),
          },
        });

      const lifecycle = await submitCalculatorTurn(service, publishTurnLifecycleResult);

      expect(lifecycle.evaluatedEvent.evaluationResult).toMatchObject({
        judgeStatus: MissionResultJudgeStatus.ERROR,
        detectedIssues: [
          expect.objectContaining({
            issueType: 'RUNTIME_ERROR',
            caseName: 'add_positive_integers',
            message: 'Container exec failed.',
          }),
        ],
      });
      expect(missionHandlers.recordFailedAttempt).not.toHaveBeenCalled();
      expect(lifecycle.turnChangedEvent).toBeNull();
      expect(missionResultsService.createMissionResult).toHaveBeenCalledWith(
        expect.objectContaining({
          judgeStatus: MissionResultJudgeStatus.ERROR,
        }),
      );
    });
  });
});

function createCalculatorTurnsHarness(input: {
  stepOrder?: number;
  testCases?: Array<{
    name: string;
    stdinLines: string[];
    expectedStdout: string;
  }>;
  executions: Array<{
    status: ExecutionStatus;
    exitCode: number | null;
    stdout: string;
    stderr: string;
    runtimeFailureCode: string | null;
    runtimeFailureMessage: string | null;
  }>;
  missionHandlers?: Record<string, jest.Mock>;
}) {
  const room = createScenarioRoom();
  const mission = createCalculatorScenarioMission({
    stepOrder: input.stepOrder,
    testCases: input.testCases,
  });
  const currentStep = createCalculatorScenarioCurrentStep(input.stepOrder ?? 1);
  const turn = createScenarioTurn();
  const manager = createScenarioTurnManager({
    room,
    mission,
    currentStep,
    turn,
    participants: createScenarioParticipants(),
    snapshots: [],
    turns: [turn],
  });
  const dataSource = {
    transaction: jest.fn(async (callback: (m: EntityManager) => unknown) =>
      callback(manager as unknown as EntityManager),
    ),
  } as unknown as DataSource;
  const missionHandlers = {
    completeCurrentStep: jest.fn(),
    recordFailedAttempt: jest.fn().mockResolvedValue({
      mission: { ...mission, strikeCount: 1 },
      currentStep,
      missionFinished: false,
    }),
    transitionCurrentStepToInProgress: jest.fn().mockResolvedValue(currentStep),
    ...input.missionHandlers,
  };
  const executionQueue = [...input.executions];
  const executionsService: jest.Mocked<Pick<ExecutionsService, 'executeTurnCode'>> = {
    executeTurnCode: jest.fn().mockImplementation(async () => {
      const next = executionQueue.shift();

      if (!next) {
        throw new Error('No more mocked executions');
      }

      return {
        id: `execution-${executionQueue.length}`,
        ...next,
      } as ExecutionEntity;
    }),
  };
  const missionResultsService: jest.Mocked<
    Pick<MissionResultsService, 'createMissionResult'>
  > = {
    createMissionResult: jest.fn().mockResolvedValue({} as never),
  };
  const turnsService = new TurnsService(
    { get: jest.fn().mockReturnValue(10000) } as unknown as ConfigService,
    dataSource,
    missionHandlers as unknown as GameRoomMissionsService,
    executionsService as unknown as ExecutionsService,
    missionResultsService as unknown as MissionResultsService,
  );
  const publishedLifecycle: { current: TurnLifecycleResult | null } = { current: null };
  const publishTurnLifecycleResult = jest.fn(async (result: TurnLifecycleResult) => {
    publishedLifecycle.current = result;
  });
  const submitService = new DefaultRealtimeTurnSubmitService(
    turnsService,
    { publishTurnLifecycleResult } as never,
  );

  return {
    service: submitService,
    turnsService,
    missionResultsService,
    missionHandlers,
    publishTurnLifecycleResult,
    get lifecycle() {
      return publishedLifecycle.current;
    },
  };
}

async function submitCalculatorTurn(
  submitService: DefaultRealtimeTurnSubmitService,
  publishTurnLifecycleResult: jest.Mock,
): Promise<TurnLifecycleResult> {
  await submitService.submitTurn({
    gameRoomId: 'room-1',
    turnId: 'turn-1',
    userId: 'user-1',
    occurredAt: '2026-05-27T10:00:10+09:00',
    files: [
      {
        gameRoomId: 'room-1',
        turnId: 'turn-1',
        userId: 'user-1',
        filePath: 'main.py',
        content: 'print("calculator")\n',
        occurredAt: '2026-05-27T10:00:00+09:00',
      },
    ],
  });

  const lastCall =
    publishTurnLifecycleResult.mock.calls[
      publishTurnLifecycleResult.mock.calls.length - 1
    ];
  const lifecycle = lastCall?.[0] as TurnLifecycleResult | undefined;

  if (!lifecycle) {
    throw new Error('Expected turn lifecycle result to be published');
  }

  return lifecycle;
}

function createCalculatorScenarioMission(input: {
  stepOrder?: number;
  testCases?: Array<{
    name: string;
    stdinLines: string[];
    expectedStdout: string;
  }>;
}): GameRoomMissionEntity {
  const stepOrder = input.stepOrder ?? 1;
  const testCases =
    input.testCases ??
    (stepOrder === 1
      ? [
          {
            name: 'add_positive_integers',
            stdinLines: ['2', '+', '3'],
            expectedStdout: '5',
          },
          {
            name: 'add_negative_integer',
            stdinLines: ['10', '+', '-4'],
            expectedStdout: '6',
          },
        ]
      : []);

  return {
    ...createScenarioMission(),
    containerId: 'container-1',
    judgePolicyJson: {
      judgeType: 'PUBLIC_TEST_CASES',
      command: 'python /workspace/main.py',
      steps: [{ stepOrder, testCases }],
    },
  } as unknown as GameRoomMissionEntity;
}

function createCalculatorScenarioCurrentStep(
  stepOrder: number,
): GameRoomMissionStepEntity {
  return {
    ...createScenarioCurrentStep(),
    stepOrder,
    missionTemplateStep: {
      id: 'template-step-1',
      targetFilePath: 'main.py',
    },
  } as GameRoomMissionStepEntity;
}

function createScenarioRoom(): GameRoomEntity {
  return {
    id: 'room-1',
    ownerUserId: 'user-1',
    status: GameRoomStatus.IN_PROGRESS,
    difficulty: 'EASY',
    timeLimitSeconds: 30,
    maxStrikeCount: 3,
    minParticipants: 2,
    maxParticipants: 4,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as GameRoomEntity;
}

function createScenarioMission(): GameRoomMissionEntity {
  return {
    id: 'mission-1',
    gameRoomId: 'room-1',
    missionTemplateId: 'template-1',
    currentStepId: 'step-1',
    strikeCount: 0,
    judgePolicyJson: {
      command: 'python /workspace/main.py',
    },
    projectStructureJson: {
      rootPath: '/workspace',
      entryFilePath: 'main.py',
      files: [{ filePath: 'main.py', language: 'python' }],
    },
  } as unknown as GameRoomMissionEntity;
}

function createScenarioCurrentStep(): GameRoomMissionStepEntity {
  return {
    id: 'step-1',
    gameRoomMissionId: 'mission-1',
    missionTemplateStepId: 'template-step-1',
    stepOrder: 1,
    status: GameRoomMissionStepStatus.IN_PROGRESS,
    missionTemplateStep: {
      id: 'template-step-1',
      targetFilePath: 'main.py',
    },
  } as GameRoomMissionStepEntity;
}

function createScenarioTurn(): TurnEntity {
  return {
    id: 'turn-1',
    gameRoomId: 'room-1',
    missionId: 'mission-1',
    playerUserId: 'user-1',
    turnNumber: 1,
    status: TurnStatus.IN_PROGRESS,
    startedAt: new Date(),
    deadlineAt: new Date(),
    endedAt: null,
  } as TurnEntity;
}

function createScenarioParticipants(): GameRoomParticipantEntity[] {
  return [
    {
      id: 'participant-1',
      gameRoomId: 'room-1',
      userId: 'user-1',
      membershipStatus: GameRoomParticipantMembershipStatus.JOINED,
      createdAt: new Date(),
    } as GameRoomParticipantEntity,
    {
      id: 'participant-2',
      gameRoomId: 'room-1',
      userId: 'user-2',
      membershipStatus: GameRoomParticipantMembershipStatus.JOINED,
      createdAt: new Date(),
    } as GameRoomParticipantEntity,
  ];
}

function createScenarioTurnManager(input: {
  room: GameRoomEntity;
  mission: GameRoomMissionEntity;
  currentStep: GameRoomMissionStepEntity;
  turn: TurnEntity;
  participants: GameRoomParticipantEntity[];
  snapshots: TurnSnapshotEntity[];
  turns: TurnEntity[];
}) {
  const turnRepository = {
    findOne: jest.fn(
      async ({
        where,
      }: {
        where: { id?: string; gameRoomId?: string; status?: TurnStatus };
      }) => {
        return (
          input.turns.find((candidate) => {
            if (where.id !== undefined && candidate.id !== where.id) {
              return false;
            }

            if (
              where.gameRoomId !== undefined &&
              candidate.gameRoomId !== where.gameRoomId
            ) {
              return false;
            }

            if (where.status !== undefined && candidate.status !== where.status) {
              return false;
            }

            return true;
          }) ?? null
        );
      },
    ),
    create: jest.fn((value: TurnEntity) => value),
    save: jest.fn(async (turn: TurnEntity) => {
      const index = input.turns.findIndex((candidate) => candidate.id === turn.id);

      if (index >= 0) {
        input.turns[index] = turn;
        return turn;
      }

      const createdTurn = {
        ...turn,
        id: `turn-${input.turns.length + 1}`,
      } as TurnEntity;
      input.turns.push(createdTurn);
      return createdTurn;
    }),
  };
  const snapshotRepository = {
    create: jest.fn((value: TurnSnapshotEntity) => value),
    save: jest.fn(async (snapshot: TurnSnapshotEntity) => {
      input.snapshots.push(snapshot);
      return snapshot;
    }),
  };
  const roomRepository = {
    findOne: jest.fn(async () => input.room),
    save: jest.fn(async (room: GameRoomEntity) => room),
  };
  const missionRepository = {
    findOne: jest.fn(async () => input.mission),
    save: jest.fn(async (mission: GameRoomMissionEntity) => mission),
  };
  const currentStepRepository = {
    findOne: jest.fn(async () => input.currentStep),
    save: jest.fn(async (step: GameRoomMissionStepEntity) => step),
  };
  const participantRepository = {
    find: jest.fn(async () => input.participants),
  };

  return {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === TurnEntity) {
        return turnRepository;
      }
      if (entity === TurnSnapshotEntity) {
        return snapshotRepository;
      }
      if (entity === GameRoomEntity) {
        return roomRepository;
      }
      if (entity === GameRoomMissionEntity) {
        return missionRepository;
      }
      if (entity === GameRoomMissionStepEntity) {
        return currentStepRepository;
      }
      if (entity === GameRoomParticipantEntity) {
        return participantRepository;
      }

      throw new Error(`Unexpected repository entity: ${String(entity)}`);
    }),
    query: jest.fn(),
  };
}
