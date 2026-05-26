/// <reference types="jest" />

import { DataSource, EntityManager, Repository } from 'typeorm';
import { GameRoomParticipantEntity } from '@modules/game-room-participants/entity/game-room-participant.entity';
import {
  GameRoomMissionStepStatus,
  GameRoomParticipantMembershipStatus,
} from '@shared/enums';
import { GameRoomMissionEntity } from '../entity/game-room-mission.entity';
import { GameRoomMissionStepEntity } from '../entity/game-room-mission-step.entity';
import { MissionTemplateEntity } from '../entity/mission-template.entity';
import { MissionTemplateStepEntity } from '../entity/mission-template-step.entity';
import { GameRoomMissionsService } from './game-room-missions.service';

describe('GameRoomMissionsService', () => {
  let service: GameRoomMissionsService;
  let missionTemplateRepository: jest.Mocked<
    Pick<Repository<MissionTemplateEntity>, 'findOne'>
  >;
  let missionTemplateStepRepository: jest.Mocked<
    Pick<Repository<MissionTemplateStepEntity>, 'find'>
  >;
  let participantRepository: jest.Mocked<
    Pick<Repository<GameRoomParticipantEntity>, 'findOne'>
  >;
  let gameRoomMissionRepository: jest.Mocked<
    Pick<Repository<GameRoomMissionEntity>, 'create' | 'findOne' | 'save'>
  >;
  let gameRoomMissionStepRepository: jest.Mocked<
    Pick<Repository<GameRoomMissionStepEntity>, 'create' | 'findOne' | 'save'>
  >;
  let manager: jest.Mocked<Pick<EntityManager, 'getRepository'>>;
  let dataSource: { getRepository: jest.Mock };

  beforeEach(() => {
    missionTemplateRepository = {
      findOne: jest.fn(),
    };
    missionTemplateStepRepository = {
      find: jest.fn(),
    };
    participantRepository = {
      findOne: jest.fn(),
    };
    gameRoomMissionRepository = {
      create: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
    };
    gameRoomMissionStepRepository = {
      create: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
    };

    manager = {
      getRepository: jest.fn((entity) => {
        if (entity === MissionTemplateEntity) {
          return missionTemplateRepository;
        }

        if (entity === MissionTemplateStepEntity) {
          return missionTemplateStepRepository;
        }

        if (entity === GameRoomMissionEntity) {
          return gameRoomMissionRepository;
        }

        if (entity === GameRoomParticipantEntity) {
          return participantRepository;
        }

        return gameRoomMissionStepRepository;
      }),
    } as never;

    dataSource = {
      getRepository: jest.fn((entity) => {
        if (entity === GameRoomMissionEntity) {
          return gameRoomMissionRepository;
        }

        if (entity === GameRoomParticipantEntity) {
          return participantRepository;
        }

        return gameRoomMissionStepRepository;
      }),
    };

    service = new GameRoomMissionsService(dataSource as unknown as DataSource);
  });

  it('creates a room mission with the first step ready and later steps locked', async () => {
    gameRoomMissionRepository.findOne.mockResolvedValue(null);
    missionTemplateRepository.findOne.mockResolvedValue({
      id: 'template-1',
      difficulty: 'EASY',
      dockerImageId: 'docker-image-1',
      judgePolicyJson: { judge: 'strict' },
      projectStructureJson: { files: [{ filePath: 'src/app.ts' }] },
      steps: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as MissionTemplateEntity);
    missionTemplateStepRepository.find.mockResolvedValue([
      {
        id: 'template-step-1',
        missionTemplateId: 'template-1',
        stepOrder: 1,
      } as MissionTemplateStepEntity,
      {
        id: 'template-step-2',
        missionTemplateId: 'template-1',
        stepOrder: 2,
      } as MissionTemplateStepEntity,
    ]);
    gameRoomMissionRepository.create.mockImplementation((mission) => mission as never);
    gameRoomMissionRepository.save
      .mockResolvedValueOnce({
        id: 'room-mission-1',
        gameRoomId: 'room-1',
        missionTemplateId: 'template-1',
        currentStepId: null,
      } as GameRoomMissionEntity)
      .mockImplementation(async (mission) => mission as never);
    gameRoomMissionStepRepository.create.mockImplementation((step) => step as never);
    gameRoomMissionStepRepository.save.mockResolvedValue([
      {
        id: 'room-mission-step-1',
        gameRoomMissionId: 'room-mission-1',
        missionTemplateStepId: 'template-step-1',
        stepOrder: 1,
        status: GameRoomMissionStepStatus.READY,
      },
      {
        id: 'room-mission-step-2',
        gameRoomMissionId: 'room-mission-1',
        missionTemplateStepId: 'template-step-2',
        stepOrder: 2,
        status: GameRoomMissionStepStatus.LOCKED,
      },
    ] as never);

    const result = await service.createMissionForGameStart({
      manager: manager as unknown as EntityManager,
      gameRoomId: 'room-1',
      roomDifficulty: 'EASY',
      missionTemplateId: 'template-1',
      runtimeContainerId: 'container-1',
    });

    expect(gameRoomMissionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        gameRoomId: 'room-1',
        missionTemplateId: 'template-1',
        strikeCount: 0,
        containerId: 'container-1',
        judgePolicyJson: { judge: 'strict' },
        projectStructureJson: { files: [{ filePath: 'src/app.ts' }] },
        currentStepId: null,
        startedAt: expect.any(Date),
      }),
    );
    expect(gameRoomMissionStepRepository.create).toHaveBeenNthCalledWith(1, {
      gameRoomMissionId: 'room-mission-1',
      missionTemplateStepId: 'template-step-1',
      stepOrder: 1,
      status: GameRoomMissionStepStatus.READY,
    });
    expect(gameRoomMissionStepRepository.create).toHaveBeenNthCalledWith(2, {
      gameRoomMissionId: 'room-mission-1',
      missionTemplateStepId: 'template-step-2',
      stepOrder: 2,
      status: GameRoomMissionStepStatus.LOCKED,
    });
    expect(gameRoomMissionRepository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 'room-mission-1',
        currentStepId: 'room-mission-step-1',
      }),
    );
    expect(result.currentStepId).toBe('room-mission-step-1');
  });

  it('rejects game start when the selected template difficulty does not match the room', async () => {
    gameRoomMissionRepository.findOne.mockResolvedValue(null);
    missionTemplateRepository.findOne.mockResolvedValue({
      id: 'template-1',
      difficulty: 'HARD',
      dockerImageId: 'docker-image-1',
      judgePolicyJson: {},
      projectStructureJson: {},
      steps: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as MissionTemplateEntity);

    await expect(
      service.createMissionForGameStart({
        manager: manager as unknown as EntityManager,
        gameRoomId: 'room-1',
        roomDifficulty: 'EASY',
        missionTemplateId: 'template-1',
        runtimeContainerId: 'container-1',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'MISSION_TEMPLATE_DIFFICULTY_MISMATCH',
      }),
    });
  });

  it('rejects templates without any defined steps', async () => {
    gameRoomMissionRepository.findOne.mockResolvedValue(null);
    missionTemplateRepository.findOne.mockResolvedValue({
      id: 'template-1',
      difficulty: 'EASY',
      dockerImageId: 'docker-image-1',
      judgePolicyJson: {},
      projectStructureJson: {},
      steps: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as MissionTemplateEntity);
    missionTemplateStepRepository.find.mockResolvedValue([]);

    await expect(
      service.createMissionForGameStart({
        manager: manager as unknown as EntityManager,
        gameRoomId: 'room-1',
        roomDifficulty: 'EASY',
        missionTemplateId: 'template-1',
        runtimeContainerId: 'container-1',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'MISSION_TEMPLATE_STEPS_REQUIRED',
      }),
    });
  });

  it('returns the current-step hint for a joined room participant', async () => {
    gameRoomMissionRepository.findOne.mockResolvedValue({
      id: 'mission-1',
      gameRoomId: 'room-1',
      currentStepId: 'step-1',
    } as GameRoomMissionEntity);
    participantRepository.findOne.mockResolvedValue({
      id: 'participant-1',
      gameRoomId: 'room-1',
      userId: 'user-1',
      membershipStatus: GameRoomParticipantMembershipStatus.JOINED,
    } as GameRoomParticipantEntity);
    gameRoomMissionStepRepository.findOne.mockResolvedValue({
      id: 'step-1',
      gameRoomMissionId: 'mission-1',
      stepOrder: 2,
      status: GameRoomMissionStepStatus.READY,
      missionTemplateStep: {
        targetFilePath: 'src/main.ts',
        hintText: 'Check the validation branch first.',
      },
    } as GameRoomMissionStepEntity);

    await expect(
      service.getCurrentStepHint('user-1', 'mission-1'),
    ).resolves.toEqual({
      missionId: 'mission-1',
      stepId: 'step-1',
      stepOrder: 2,
      status: GameRoomMissionStepStatus.READY,
      targetFilePath: 'src/main.ts',
      hintText: 'Check the validation branch first.',
    });
  });

  it('rejects mission hint access for users outside the room', async () => {
    gameRoomMissionRepository.findOne.mockResolvedValue({
      id: 'mission-1',
      gameRoomId: 'room-1',
      currentStepId: 'step-1',
    } as GameRoomMissionEntity);
    participantRepository.findOne.mockResolvedValue(null);

    await expect(
      service.getCurrentStepHint('user-2', 'mission-1'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'GAME_ROOM_MISSION_ACCESS_DENIED',
      }),
    });
  });

  it('moves the current step to in-progress', async () => {
    gameRoomMissionRepository.findOne.mockResolvedValue({
      id: 'mission-1',
      currentStepId: 'step-1',
    } as GameRoomMissionEntity);
    gameRoomMissionStepRepository.findOne.mockResolvedValue({
      id: 'step-1',
      gameRoomMissionId: 'mission-1',
      stepOrder: 1,
      status: GameRoomMissionStepStatus.READY,
      missionTemplateStep: {} as MissionTemplateStepEntity,
    } as GameRoomMissionStepEntity);
    gameRoomMissionStepRepository.save.mockImplementation(async (step) => step as never);

    const result = await service.transitionCurrentStepToInProgress({
      manager: manager as unknown as EntityManager,
      gameRoomMissionId: 'mission-1',
    });

    expect(result.status).toBe(GameRoomMissionStepStatus.IN_PROGRESS);
  });

  it('clears the current step, unlocks the next step, and advances the mission', async () => {
    gameRoomMissionRepository.findOne.mockResolvedValue({
      id: 'mission-1',
      currentStepId: 'step-1',
      finishedAt: null,
    } as GameRoomMissionEntity);
    gameRoomMissionStepRepository.findOne
      .mockResolvedValueOnce({
        id: 'step-1',
        gameRoomMissionId: 'mission-1',
        stepOrder: 1,
        status: GameRoomMissionStepStatus.IN_PROGRESS,
        missionTemplateStep: {} as MissionTemplateStepEntity,
      } as GameRoomMissionStepEntity)
      .mockResolvedValueOnce({
        id: 'step-2',
        gameRoomMissionId: 'mission-1',
        stepOrder: 2,
        status: GameRoomMissionStepStatus.LOCKED,
        missionTemplateStep: {} as MissionTemplateStepEntity,
      } as GameRoomMissionStepEntity);
    gameRoomMissionStepRepository.save.mockImplementation(async (step) => step as never);
    gameRoomMissionRepository.save.mockImplementation(async (mission) => mission as never);

    const result = await service.completeCurrentStep({
      manager: manager as unknown as EntityManager,
      gameRoomMissionId: 'mission-1',
    });

    expect(result.clearedStep.status).toBe(GameRoomMissionStepStatus.CLEARED);
    expect(result.nextStep?.status).toBe(GameRoomMissionStepStatus.READY);
    expect(result.mission.currentStepId).toBe('step-2');
    expect(result.missionFinished).toBe(false);
  });

  it('finishes the mission when the final step is cleared', async () => {
    gameRoomMissionRepository.findOne.mockResolvedValue({
      id: 'mission-1',
      currentStepId: 'step-2',
      finishedAt: null,
    } as GameRoomMissionEntity);
    gameRoomMissionStepRepository.findOne
      .mockResolvedValueOnce({
        id: 'step-2',
        gameRoomMissionId: 'mission-1',
        stepOrder: 2,
        status: GameRoomMissionStepStatus.IN_PROGRESS,
        missionTemplateStep: {} as MissionTemplateStepEntity,
      } as GameRoomMissionStepEntity)
      .mockResolvedValueOnce(null);
    gameRoomMissionStepRepository.save.mockImplementation(async (step) => step as never);
    gameRoomMissionRepository.save.mockImplementation(async (mission) => mission as never);

    const result = await service.completeCurrentStep({
      manager: manager as unknown as EntityManager,
      gameRoomMissionId: 'mission-1',
    });

    expect(result.nextStep).toBeNull();
    expect(result.mission.currentStepId).toBeNull();
    expect(result.mission.finishedAt).toBeInstanceOf(Date);
    expect(result.missionFinished).toBe(true);
  });

  it('increments strikes and keeps the current step active below the strike limit', async () => {
    gameRoomMissionRepository.findOne.mockResolvedValue({
      id: 'mission-1',
      currentStepId: 'step-1',
      strikeCount: 0,
      finishedAt: null,
    } as GameRoomMissionEntity);
    gameRoomMissionStepRepository.findOne.mockResolvedValue({
      id: 'step-1',
      gameRoomMissionId: 'mission-1',
      stepOrder: 1,
      status: GameRoomMissionStepStatus.IN_PROGRESS,
      missionTemplateStep: {} as MissionTemplateStepEntity,
    } as GameRoomMissionStepEntity);
    gameRoomMissionStepRepository.save.mockImplementation(async (step) => step as never);
    gameRoomMissionRepository.save.mockImplementation(async (mission) => mission as never);

    const result = await service.recordFailedAttempt({
      manager: manager as unknown as EntityManager,
      gameRoomMissionId: 'mission-1',
      strikeLimit: 3,
    });

    expect(result.mission.strikeCount).toBe(1);
    expect(result.currentStep.status).toBe(GameRoomMissionStepStatus.READY);
    expect(result.strikeLimitReached).toBe(false);
    expect(result.missionFinished).toBe(false);
  });

  it('marks the current step failed and finishes the mission when the strike limit is reached', async () => {
    gameRoomMissionRepository.findOne.mockResolvedValue({
      id: 'mission-1',
      currentStepId: 'step-1',
      strikeCount: 2,
      finishedAt: null,
    } as GameRoomMissionEntity);
    gameRoomMissionStepRepository.findOne.mockResolvedValue({
      id: 'step-1',
      gameRoomMissionId: 'mission-1',
      stepOrder: 1,
      status: GameRoomMissionStepStatus.IN_PROGRESS,
      missionTemplateStep: {} as MissionTemplateStepEntity,
    } as GameRoomMissionStepEntity);
    gameRoomMissionStepRepository.save.mockImplementation(async (step) => step as never);
    gameRoomMissionRepository.save.mockImplementation(async (mission) => mission as never);

    const result = await service.recordFailedAttempt({
      manager: manager as unknown as EntityManager,
      gameRoomMissionId: 'mission-1',
      strikeLimit: 3,
    });

    expect(result.mission.strikeCount).toBe(3);
    expect(result.currentStep.status).toBe(GameRoomMissionStepStatus.FAILED);
    expect(result.mission.currentStepId).toBeNull();
    expect(result.mission.finishedAt).toBeInstanceOf(Date);
    expect(result.strikeLimitReached).toBe(true);
    expect(result.missionFinished).toBe(true);
  });
});
