import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';
import { ExecutionEntity } from '@modules/executions/entity/execution.entity';
import { ExecutionsService } from '@modules/executions/service/executions.service';
import { GameRoomMissionStepEntity } from '@modules/game-room-missions/entity/game-room-mission-step.entity';
import { GameRoomMissionEntity } from '@modules/game-room-missions/entity/game-room-mission.entity';
import { GameRoomMissionsService } from '@modules/game-room-missions/service/game-room-missions.service';
import { GameRoomParticipantEntity } from '@modules/game-room-participants/entity/game-room-participant.entity';
import { GameRoomEntity } from '@modules/game-rooms/entity/game-room.entity';
import { MissionResultsService } from '@modules/mission-results/service/mission-results.service';
import {
  ExecutionStatus,
  GameRoomMissionStepStatus,
  GameRoomParticipantMembershipStatus,
  GameRoomStatus,
  MissionResultJudgeStatus,
  TurnStatus,
} from '@shared/enums';
import { TurnSnapshotEntity } from '../entity/turn-snapshot.entity';
import { TurnEntity } from '../entity/turn.entity';
import { TurnsService } from './turns.service';

describe('TurnsService', () => {
  it('persists snapshot, execution outcome, and next turn on successful submit', async () => {
    const room = createRoom();
    const mission = createMission();
    const currentStep = createCurrentStep();
    const turn = createTurn();
    const participants = createParticipants();
    const snapshots: TurnSnapshotEntity[] = [];
    const turns = [turn];
    const manager = createManager({
      room,
      mission,
      currentStep,
      turns,
      participants,
      snapshots,
    });
    const dataSource = {
      transaction: jest.fn(async (callback: (manager: EntityManager) => unknown) =>
        callback(manager as unknown as EntityManager),
      ),
    } as unknown as DataSource;
    const gameRoomMissionsService: jest.Mocked<
      Pick<
        GameRoomMissionsService,
        'completeCurrentStep' | 'recordFailedAttempt' | 'transitionCurrentStepToInProgress'
      >
    > = {
      completeCurrentStep: jest.fn().mockResolvedValue({
        mission: {
          ...mission,
          currentStepId: 'step-2',
          strikeCount: 0,
        },
        clearedStep: {
          ...currentStep,
          status: GameRoomMissionStepStatus.CLEARED,
        },
        nextStep: {
          ...currentStep,
          id: 'step-2',
          stepOrder: 2,
          status: GameRoomMissionStepStatus.READY,
        },
        missionFinished: false,
      }),
      recordFailedAttempt: jest.fn(),
      transitionCurrentStepToInProgress: jest.fn().mockResolvedValue({
        ...currentStep,
        id: 'step-2',
        stepOrder: 2,
        status: GameRoomMissionStepStatus.IN_PROGRESS,
      }),
    };
    const executionsService: jest.Mocked<Pick<ExecutionsService, 'executeTurnCode'>> = {
      executeTurnCode: jest.fn().mockResolvedValue({
        id: 'execution-1',
        status: ExecutionStatus.SUCCESS,
        exitCode: 0,
        stdout: 'ok',
        stderr: '',
        runtimeFailureCode: null,
        runtimeFailureMessage: null,
      } as ExecutionEntity),
    };
    const missionResultsService: jest.Mocked<
      Pick<MissionResultsService, 'createMissionResult'>
    > = {
      createMissionResult: jest.fn().mockResolvedValue({} as never),
    };
    const service = new TurnsService(
      {
        get: jest.fn().mockReturnValue(10000),
      } as unknown as ConfigService,
      dataSource,
      gameRoomMissionsService as unknown as GameRoomMissionsService,
      executionsService as unknown as ExecutionsService,
      missionResultsService as unknown as MissionResultsService,
    );

    const result = await service.submitTurn({
      gameRoomId: room.id,
      turnId: turn.id,
      userId: turn.playerUserId,
      occurredAt: '2026-05-26T10:00:10+09:00',
      files: [
        {
          gameRoomId: room.id,
          turnId: turn.id,
          userId: turn.playerUserId,
          filePath: 'main.py',
          content: 'print("done")\n',
          occurredAt: '2026-05-26T10:00:00+09:00',
        },
      ],
    });

    expect(snapshots).toHaveLength(1);
    expect(turn.status).toBe(TurnStatus.SUBMITTED);
    expect(executionsService.executeTurnCode).toHaveBeenCalledWith(
      expect.objectContaining({
        gameRoomId: room.id,
        missionId: mission.id,
        turnId: turn.id,
        filePath: '/workspace/main.py',
        content: 'print("done")\n',
      }),
    );
    expect(gameRoomMissionsService.completeCurrentStep).toHaveBeenCalled();
    expect(gameRoomMissionsService.transitionCurrentStepToInProgress).toHaveBeenCalled();
    expect(missionResultsService.createMissionResult).toHaveBeenCalledWith(
      expect.objectContaining({
        judgeStatus: MissionResultJudgeStatus.PASSED,
      }),
    );
    expect(result.turnChangedEvent).toMatchObject({
      gameRoomId: room.id,
      previousTurnId: turn.id,
      currentTurnId: 'turn-2',
      nextPlayerId: 'user-2',
    });
    expect(result.missionResultEvent).toBeNull();
    expect(result.gameStateUpdatedEvent.gameState).toMatchObject({
      status: GameRoomStatus.IN_PROGRESS,
    });
  });

  it('finishes the room and emits mission-result when timeout reaches strike limit', async () => {
    const room = createRoom();
    room.maxStrikeCount = 1;
    const mission = createMission();
    mission.strikeCount = 0;
    const currentStep = createCurrentStep();
    const turn = createTurn();
    const participants = createParticipants();
    const snapshots: TurnSnapshotEntity[] = [];
    const turns = [turn];
    const manager = createManager({
      room,
      mission,
      currentStep,
      turns,
      participants,
      snapshots,
    });
    const dataSource = {
      transaction: jest.fn(async (callback: (manager: EntityManager) => unknown) =>
        callback(manager as unknown as EntityManager),
      ),
    } as unknown as DataSource;
    const gameRoomMissionsService: jest.Mocked<
      Pick<
        GameRoomMissionsService,
        'completeCurrentStep' | 'recordFailedAttempt' | 'transitionCurrentStepToInProgress'
      >
    > = {
      completeCurrentStep: jest.fn(),
      recordFailedAttempt: jest.fn().mockResolvedValue({
        mission: {
          ...mission,
          currentStepId: null,
          strikeCount: 1,
          finishedAt: new Date('2026-05-26T01:00:10.000Z'),
        },
        currentStep: {
          ...currentStep,
          status: GameRoomMissionStepStatus.FAILED,
        },
        strikeLimitReached: true,
        missionFinished: true,
      }),
      transitionCurrentStepToInProgress: jest.fn(),
    };
    const executionsService: jest.Mocked<Pick<ExecutionsService, 'executeTurnCode'>> = {
      executeTurnCode: jest.fn().mockResolvedValue({
        id: 'execution-1',
        status: ExecutionStatus.TIMEOUT,
        exitCode: null,
        stdout: '',
        stderr: 'timeout',
        runtimeFailureCode: null,
        runtimeFailureMessage: null,
      } as ExecutionEntity),
    };
    const missionResultsService: jest.Mocked<
      Pick<MissionResultsService, 'createMissionResult'>
    > = {
      createMissionResult: jest.fn().mockResolvedValue({} as never),
    };
    const service = new TurnsService(
      {
        get: jest.fn().mockReturnValue(10000),
      } as unknown as ConfigService,
      dataSource,
      gameRoomMissionsService as unknown as GameRoomMissionsService,
      executionsService as unknown as ExecutionsService,
      missionResultsService as unknown as MissionResultsService,
    );

    const result = await service.timeoutTurn({
      gameRoomId: room.id,
      turnId: turn.id,
      userId: turn.playerUserId,
      occurredAt: '2026-05-26T10:00:10+09:00',
      files: [
        {
          gameRoomId: room.id,
          turnId: turn.id,
          userId: turn.playerUserId,
          filePath: 'main.py',
          content: 'print("timeout")\n',
          occurredAt: '2026-05-26T10:00:00+09:00',
        },
      ],
    });

    expect(turn.status).toBe(TurnStatus.TIMEOUT);
    expect(gameRoomMissionsService.recordFailedAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        strikeLimit: 1,
      }),
    );
    expect(missionResultsService.createMissionResult).toHaveBeenCalledWith(
      expect.objectContaining({
        judgeStatus: MissionResultJudgeStatus.FAILED,
      }),
    );
    expect(result.turnChangedEvent).toBeNull();
    expect(result.missionResultEvent).toMatchObject({
      gameRoomId: room.id,
      missionResult: expect.objectContaining({
        missionId: mission.id,
        judgeStatus: MissionResultJudgeStatus.FAILED,
        isMissionCleared: false,
      }),
    });
    expect(result.gameStateUpdatedEvent.gameState).toMatchObject({
      status: GameRoomStatus.FINISHED,
    });
  });

  it('keeps processing errors explicit without advancing to the next turn', async () => {
    const room = createRoom();
    const mission = createMission();
    const currentStep = createCurrentStep();
    const turn = createTurn();
    const participants = createParticipants();
    const snapshots: TurnSnapshotEntity[] = [];
    const turns = [turn];
    const manager = createManager({
      room,
      mission,
      currentStep,
      turns,
      participants,
      snapshots,
    });
    const dataSource = {
      transaction: jest.fn(async (callback: (manager: EntityManager) => unknown) =>
        callback(manager as unknown as EntityManager),
      ),
    } as unknown as DataSource;
    const gameRoomMissionsService: jest.Mocked<
      Pick<
        GameRoomMissionsService,
        'completeCurrentStep' | 'recordFailedAttempt' | 'transitionCurrentStepToInProgress'
      >
    > = {
      completeCurrentStep: jest.fn(),
      recordFailedAttempt: jest.fn(),
      transitionCurrentStepToInProgress: jest.fn(),
    };
    const executionsService: jest.Mocked<Pick<ExecutionsService, 'executeTurnCode'>> = {
      executeTurnCode: jest.fn().mockResolvedValue({
        id: 'execution-1',
        status: ExecutionStatus.FAILED,
        exitCode: null,
        stdout: '',
        stderr: '',
        runtimeFailureCode: 'RUNTIME_CONTAINER_UNAVAILABLE',
        runtimeFailureMessage: 'Mission runtime container is not available.',
      } as ExecutionEntity),
    };
    const missionResultsService: jest.Mocked<
      Pick<MissionResultsService, 'createMissionResult'>
    > = {
      createMissionResult: jest.fn().mockResolvedValue({} as never),
    };
    const service = new TurnsService(
      {
        get: jest.fn().mockReturnValue(10000),
      } as unknown as ConfigService,
      dataSource,
      gameRoomMissionsService as unknown as GameRoomMissionsService,
      executionsService as unknown as ExecutionsService,
      missionResultsService as unknown as MissionResultsService,
    );

    const result = await service.submitTurn({
      gameRoomId: room.id,
      turnId: turn.id,
      userId: turn.playerUserId,
      occurredAt: '2026-05-26T10:00:10+09:00',
      files: [
        {
          gameRoomId: room.id,
          turnId: turn.id,
          userId: turn.playerUserId,
          filePath: 'main.py',
          content: 'print("broken")\n',
          occurredAt: '2026-05-26T10:00:00+09:00',
        },
      ],
    });

    expect(gameRoomMissionsService.completeCurrentStep).not.toHaveBeenCalled();
    expect(gameRoomMissionsService.recordFailedAttempt).not.toHaveBeenCalled();
    expect(result.turnChangedEvent).toBeNull();
    expect(result.missionResultEvent).toBeNull();
    expect(result.gameStateUpdatedEvent.gameState).toMatchObject({
      status: GameRoomStatus.IN_PROGRESS,
      turnState: null,
    });
    expect(missionResultsService.createMissionResult).toHaveBeenCalledWith(
      expect.objectContaining({
        judgeStatus: MissionResultJudgeStatus.ERROR,
      }),
    );
  });
});

function createRoom(): GameRoomEntity {
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

function createMission(): GameRoomMissionEntity {
  return {
    id: 'mission-1',
    gameRoomId: 'room-1',
    missionTemplateId: 'template-1',
    currentStepId: 'step-1',
    containerId: null,
    strikeCount: 0,
    judgePolicyJson: {
      command: 'python /workspace/main.py',
    },
    projectStructureJson: {
      rootPath: '/workspace',
      entryFilePath: 'main.py',
      files: [
        {
          filePath: 'main.py',
          language: 'python',
        },
      ],
    },
    startedAt: new Date(),
    finishedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as GameRoomMissionEntity;
}

function createCurrentStep(): GameRoomMissionStepEntity {
  return {
    id: 'step-1',
    gameRoomMissionId: 'mission-1',
    missionTemplateStepId: 'template-step-1',
    stepOrder: 1,
    status: GameRoomMissionStepStatus.IN_PROGRESS,
    missionTemplateStep: {
      id: 'template-step-1',
      missionTemplateId: 'template-1',
      stepOrder: 1,
      targetFilePath: 'main.py',
      successCriteriaJson: {},
      hintText: 'hint',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  } as GameRoomMissionStepEntity;
}

function createTurn(): TurnEntity {
  return {
    id: 'turn-1',
    gameRoomId: 'room-1',
    missionId: 'mission-1',
    playerUserId: 'user-1',
    turnNumber: 1,
    status: TurnStatus.IN_PROGRESS,
    startedAt: new Date('2026-05-26T01:00:00.000Z'),
    deadlineAt: new Date('2026-05-26T01:00:30.000Z'),
    endedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as TurnEntity;
}

function createParticipants(): GameRoomParticipantEntity[] {
  return [
    {
      id: 'participant-1',
      gameRoomId: 'room-1',
      userId: 'user-1',
      membershipStatus: GameRoomParticipantMembershipStatus.JOINED,
      createdAt: new Date('2026-05-26T00:59:00.000Z'),
    },
    {
      id: 'participant-2',
      gameRoomId: 'room-1',
      userId: 'user-2',
      membershipStatus: GameRoomParticipantMembershipStatus.JOINED,
      createdAt: new Date('2026-05-26T00:59:10.000Z'),
    },
  ] as GameRoomParticipantEntity[];
}

function createManager(input: {
  room: GameRoomEntity;
  mission: GameRoomMissionEntity;
  currentStep: GameRoomMissionStepEntity;
  turns: TurnEntity[];
  participants: GameRoomParticipantEntity[];
  snapshots: TurnSnapshotEntity[];
}) {
  return {
    query: jest.fn(),
    getRepository: jest.fn((entity) => {
      if (entity === GameRoomEntity) {
        return {
          findOne: jest.fn(async ({ where }) =>
            where.id === input.room.id ? input.room : null,
          ),
          save: jest.fn(async (value) => Object.assign(input.room, value)),
        };
      }

      if (entity === GameRoomMissionEntity) {
        return {
          findOne: jest.fn(async ({ where }) =>
            where.id === input.mission.id ? input.mission : null,
          ),
          save: jest.fn(async (value) => Object.assign(input.mission, value)),
        };
      }

      if (entity === GameRoomMissionStepEntity) {
        return {
          findOne: jest.fn(async ({ where }) =>
            where.id === input.currentStep.id ? input.currentStep : null,
          ),
          save: jest.fn(async (value) => Object.assign(input.currentStep, value)),
        };
      }

      if (entity === TurnEntity) {
        return {
          findOne: jest.fn(async ({ where }) =>
            input.turns.find(
              (turn) => turn.id === where.id && turn.gameRoomId === where.gameRoomId,
            ) ?? null,
          ),
          create: jest.fn((value) => value),
          save: jest.fn(async (value) => {
            const existing = input.turns.find((turn) => turn.id === value.id);

            if (existing) {
              Object.assign(existing, value);
              return existing;
            }

            const createdTurn = {
              ...value,
              id: `turn-${input.turns.length + 1}`,
              createdAt: new Date(),
              updatedAt: new Date(),
            } as TurnEntity;
            input.turns.push(createdTurn);
            return createdTurn;
          }),
        };
      }

      if (entity === TurnSnapshotEntity) {
        return {
          create: jest.fn((value) => value),
          save: jest.fn(async (value) => {
            const snapshot = {
              ...value,
              id: `snapshot-${input.snapshots.length + 1}`,
              createdAt: new Date(),
              updatedAt: new Date(),
            } as TurnSnapshotEntity;
            input.snapshots.push(snapshot);
            return snapshot;
          }),
        };
      }

      return {
        find: jest.fn(async () => input.participants),
      };
    }),
  };
}
