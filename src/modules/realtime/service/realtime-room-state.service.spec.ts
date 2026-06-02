/// <reference types="jest" />

import { DataSource, ObjectLiteral, Repository } from 'typeorm';
import { User } from '@modules/auth/entity/user.entity';
import { GameRoomMissionStepEntity } from '@modules/game-room-missions/entity/game-room-mission-step.entity';
import { GameRoomMissionEntity } from '@modules/game-room-missions/entity/game-room-mission.entity';
import { MissionTemplateEntity } from '@modules/game-room-missions/entity/mission-template.entity';
import { GameRoomParticipantEntity } from '@modules/game-room-participants/entity/game-room-participant.entity';
import { GameRoomEntity } from '@modules/game-rooms/entity/game-room.entity';
import { TurnEntity } from '@modules/turns/entity/turn.entity';
import {
  GameRoomMissionStepStatus,
  GameRoomParticipantMembershipStatus,
  GameRoomParticipantRole,
  GameRoomStatus,
  TurnStatus,
} from '@shared/enums';
import { RealtimeRoomStateService } from './realtime-room-state.service';

describe('RealtimeRoomStateService', () => {
  it('hydrates mission and step metadata for in-progress room snapshots', async () => {
    const roomRepository = createRepositoryMock<GameRoomEntity>({
      findOne: jest.fn().mockResolvedValue({
        id: 'room-1',
        status: GameRoomStatus.IN_PROGRESS,
        difficulty: 'EASY',
        timeLimitSeconds: 30,
        maxStrikeCount: 3,
      } as GameRoomEntity),
    });
    const participantRepository = createRepositoryMock<GameRoomParticipantEntity>({
      find: jest.fn().mockResolvedValue([
        {
          id: 'participant-1',
          gameRoomId: 'room-1',
          userId: 'user-1',
          role: GameRoomParticipantRole.OWNER,
          membershipStatus: GameRoomParticipantMembershipStatus.JOINED,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as unknown as GameRoomParticipantEntity,
      ]),
    });
    const userRepository = createRepositoryMock<User>({
      find: jest.fn().mockResolvedValue([
        { id: 'user-1', nickname: 'owner' } as User,
      ]),
    });
    const missionRepository = createRepositoryMock<GameRoomMissionEntity>({
      findOne: jest.fn().mockResolvedValue({
        id: 'mission-1',
        gameRoomId: 'room-1',
        missionTemplateId: 'template-1',
        currentStepId: 'step-1',
        containerId: 'container-1',
        strikeCount: 0,
        judgePolicyJson: {},
        projectStructureJson: {
          files: [{ filePath: 'main.py', language: 'python', readonly: false }],
        },
        startedAt: new Date(),
        finishedAt: null,
      } as unknown as GameRoomMissionEntity),
    });
    const missionTemplateRepository = createRepositoryMock<MissionTemplateEntity>({
      findOne: jest.fn().mockResolvedValue({
        id: 'template-1',
        title: 'Calculator Relay',
        description: 'Complete the calculator mission.',
        language: 'python',
      } as MissionTemplateEntity),
    });
    const missionStepRepository = createRepositoryMock<GameRoomMissionStepEntity>({
      findOne: jest.fn().mockResolvedValue({
        id: 'step-1',
        gameRoomMissionId: 'mission-1',
        missionTemplateStepId: 'template-step-1',
        stepOrder: 1,
        status: GameRoomMissionStepStatus.IN_PROGRESS,
        missionTemplateStep: {
          title: 'Step 1',
          description: 'Complete the first step.',
        } as never,
      } as unknown as GameRoomMissionStepEntity),
    });
    const turnRepository = createRepositoryMock<TurnEntity>({
      findOne: jest.fn().mockResolvedValue({
        id: 'turn-1',
        gameRoomId: 'room-1',
        playerUserId: 'user-1',
        turnNumber: 1,
        status: TurnStatus.IN_PROGRESS,
        startedAt: new Date('2026-06-01T10:00:00+09:00'),
        deadlineAt: new Date('2026-06-01T10:00:30+09:00'),
      } as TurnEntity),
    });

    const dataSource = {
      getRepository: jest.fn((entity) => {
        if (entity === GameRoomEntity) {
          return roomRepository;
        }
        if (entity === GameRoomParticipantEntity) {
          return participantRepository;
        }
        if (entity === User) {
          return userRepository;
        }
        if (entity === GameRoomMissionEntity) {
          return missionRepository;
        }
        if (entity === MissionTemplateEntity) {
          return missionTemplateRepository;
        }
        if (entity === GameRoomMissionStepEntity) {
          return missionStepRepository;
        }
        return turnRepository;
      }),
    } as unknown as DataSource;

    const service = new RealtimeRoomStateService(dataSource);

    const event = await service.buildParticipantsUpdatedEvent({
      gameRoomId: 'room-1',
    });

    expect(missionTemplateRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'template-1' },
    });
    expect(event.missionState).toEqual(
      expect.objectContaining({
        missionId: 'mission-1',
        missionTemplateId: 'template-1',
        currentStepId: 'step-1',
        currentStepStatus: GameRoomMissionStepStatus.IN_PROGRESS,
        gameRoomMissionStepId: 'step-1',
        missionTemplateStepId: 'template-step-1',
        stepOrder: 1,
        stepTitle: 'Step 1',
        stepDescription: 'Complete the first step.',
        title: 'Calculator Relay',
        description: 'Complete the calculator mission.',
        language: 'python',
      }),
    );
  });
});

function createRepositoryMock<T extends ObjectLiteral>(
  input: Partial<jest.Mocked<Repository<T>>> = {},
) {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    ...input,
  } as jest.Mocked<Repository<T>>;
}
