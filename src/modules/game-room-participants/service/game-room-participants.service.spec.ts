/// <reference types="jest" />

import { ModuleRef } from '@nestjs/core';
import { In, Repository } from 'typeorm';
import { GameRoomEntity } from '@modules/game-rooms/entity/game-room.entity';
import { GameRoomParticipantsService } from './game-room-participants.service';
import { GameRoomParticipantEntity } from '../entity/game-room-participant.entity';
import { RealtimeEventSupportService } from '@modules/realtime/service/realtime-event-support.service';
import { RealtimeRoomStateService } from '@modules/realtime/service/realtime-room-state.service';
import {
  GameRoomParticipantMembershipStatus,
  GameRoomParticipantRole,
  GameRoomStatus,
} from '@shared/enums';

describe('GameRoomParticipantsService', () => {
  let service: GameRoomParticipantsService;
  let participantRepository: jest.Mocked<
    Pick<
      Repository<GameRoomParticipantEntity>,
      'count' | 'create' | 'save' | 'find' | 'findOne'
    >
  >;
  let roomRepository: jest.Mocked<Pick<Repository<GameRoomEntity>, 'findOne'>>;
  let manager: { getRepository: jest.Mock; query: jest.Mock };
  let dataSource: { transaction: jest.Mock; getRepository: jest.Mock };
  let realtimeRoomStateService: jest.Mocked<
    Pick<RealtimeRoomStateService, 'buildParticipantsUpdatedEvent'>
  >;
  let realtimeEventSupportService: jest.Mocked<
    Pick<RealtimeEventSupportService, 'publishRoomParticipantsUpdated'>
  >;
  let moduleRef: ModuleRef;

  beforeEach(() => {
    participantRepository = {
      count: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
    };

    roomRepository = {
      findOne: jest.fn(),
    };

    manager = {
      getRepository: jest.fn((entity) => {
        if (entity === GameRoomEntity) {
          return roomRepository;
        }

        return participantRepository;
      }),
      query: jest.fn(),
    };

    dataSource = {
      transaction: jest.fn(async (callback) => callback(manager)),
      getRepository: jest.fn(() => participantRepository),
    };

    realtimeRoomStateService = {
      buildParticipantsUpdatedEvent: jest.fn().mockResolvedValue({
        gameRoomId: 'room-1',
        participants: [],
        changedParticipant: null,
        gameState: { status: GameRoomStatus.WAITING },
        missionState: null,
        occurredAt: '2026-06-01T10:00:00+09:00',
      }),
    };
    realtimeEventSupportService = {
      publishRoomParticipantsUpdated: jest.fn(),
    };
    moduleRef = {
      get: jest.fn((token: unknown) => {
        if (token === RealtimeRoomStateService) {
          return realtimeRoomStateService;
        }

        if (token === RealtimeEventSupportService) {
          return realtimeEventSupportService;
        }

        throw new Error(`Unexpected module token: ${String(token)}`);
      }),
    } as unknown as ModuleRef;

    service = new GameRoomParticipantsService(
      dataSource as never,
      moduleRef,
    );
  });

  it('lists participant state only for rooms accessible to the authenticated user', async () => {
    participantRepository.find
      .mockResolvedValueOnce([
        {
          id: 'membership-1',
          gameRoomId: 'room-1',
          userId: 'owner-1',
          membershipStatus: GameRoomParticipantMembershipStatus.JOINED,
          gameRoom: {
            id: 'room-1',
            status: GameRoomStatus.WAITING,
          },
        } as GameRoomParticipantEntity,
      ])
      .mockResolvedValueOnce([
        {
          id: 'participant-1',
          gameRoomId: 'room-1',
          userId: 'owner-1',
          membershipStatus: GameRoomParticipantMembershipStatus.JOINED,
          role: GameRoomParticipantRole.OWNER,
          gameRoom: {
            id: 'room-1',
            status: GameRoomStatus.WAITING,
          },
        } as GameRoomParticipantEntity,
        {
          id: 'participant-2',
          gameRoomId: 'room-1',
          userId: 'invitee-1',
          membershipStatus: GameRoomParticipantMembershipStatus.INVITED,
          role: GameRoomParticipantRole.PARTICIPANT,
          gameRoom: {
            id: 'room-1',
            status: GameRoomStatus.WAITING,
          },
        } as GameRoomParticipantEntity,
      ]);

    dataSource.getRepository = jest.fn((entity) => {
      if (entity === GameRoomParticipantEntity) {
        return participantRepository;
      }

      return {
        find: jest.fn().mockResolvedValue([
          { id: 'owner-1', nickname: 'owner' },
          { id: 'invitee-1', nickname: 'invitee' },
        ]),
      };
    });

    const result = await service.listParticipantsForUser({
      authenticatedUserId: 'owner-1',
      query: {},
    });

    expect(dataSource.getRepository).toHaveBeenCalledWith(GameRoomParticipantEntity);
    expect(participantRepository.find).toHaveBeenNthCalledWith(1, {
      relations: { gameRoom: true },
      where: {
        userId: 'owner-1',
        membershipStatus: In([
          GameRoomParticipantMembershipStatus.INVITED,
          GameRoomParticipantMembershipStatus.JOINED,
        ]),
      },
      order: {
        createdAt: 'ASC',
      },
    });
    expect(participantRepository.find).toHaveBeenNthCalledWith(2, {
      relations: { gameRoom: true },
      where: {
        gameRoomId: In(['room-1']),
      },
      order: {
        createdAt: 'ASC',
      },
    });
    expect(result).toEqual([
      expect.objectContaining({
        id: 'participant-1',
        gameRoomTitle: '대기방',
        userId: 'owner-1',
        nickname: 'owner',
        role: GameRoomParticipantRole.OWNER,
        membershipStatus: GameRoomParticipantMembershipStatus.JOINED,
        status: GameRoomParticipantMembershipStatus.JOINED,
        roomStatus: GameRoomStatus.WAITING,
      }),
      expect.objectContaining({
        id: 'participant-2',
        userId: 'invitee-1',
        nickname: 'invitee',
        role: GameRoomParticipantRole.PARTICIPANT,
        membershipStatus: GameRoomParticipantMembershipStatus.INVITED,
        status: GameRoomParticipantMembershipStatus.INVITED,
        roomStatus: GameRoomStatus.WAITING,
      }),
    ]);
  });

  it('returns an empty participant list when the authenticated user has no accessible room', async () => {
    participantRepository.find.mockResolvedValueOnce([]);

    await expect(
      service.listParticipantsForUser({
        authenticatedUserId: 'owner-1',
        query: {},
      }),
    ).resolves.toEqual([]);
    expect(participantRepository.find).toHaveBeenCalledTimes(1);
  });

  it('rejects a mismatched userId query parameter', async () => {
    await expect(
      service.listParticipantsForUser({
        authenticatedUserId: 'owner-1',
        query: { userId: 'other-user' },
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'FORBIDDEN_RESOURCE_ACCESS',
      }),
    });
  });

  it('allows only the room owner to invite participants', async () => {
    roomRepository.findOne.mockResolvedValue({
      id: 'room-1',
      ownerUserId: 'owner-1',
      status: GameRoomStatus.WAITING,
    } as GameRoomEntity);

    await expect(
      service.inviteParticipant({
        actorUserId: 'other-user',
        gameRoomId: 'room-1',
        invitedUserId: 'invitee-1',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'GAME_ROOM_OWNER_REQUIRED',
      }),
    });
  });

  it('rejects duplicate invites for the same room', async () => {
    roomRepository.findOne.mockResolvedValue({
      id: 'room-1',
      ownerUserId: 'owner-1',
      status: GameRoomStatus.WAITING,
    } as GameRoomEntity);
    participantRepository.findOne.mockResolvedValue({
      id: 'participant-1',
    } as GameRoomParticipantEntity);

    await expect(
      service.inviteParticipant({
        actorUserId: 'owner-1',
        gameRoomId: 'room-1',
        invitedUserId: 'invitee-1',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'DUPLICATE_ROOM_MEMBERSHIP',
      }),
    });
  });

  it('allows only the invited user to accept an invitation', async () => {
    participantRepository.findOne.mockResolvedValue({
      id: 'participant-1',
      userId: 'invitee-1',
      gameRoomId: 'room-1',
      membershipStatus: GameRoomParticipantMembershipStatus.INVITED,
      gameRoom: {
        id: 'room-1',
        status: GameRoomStatus.WAITING,
      },
    } as GameRoomParticipantEntity);

    await expect(
      service.acceptInvitation({
        actorUserId: 'other-user',
        participantId: 'participant-1',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'INVITED_USER_REQUIRED',
      }),
    });
  });

  it('rejects invalid membership transitions explicitly', async () => {
    participantRepository.findOne.mockResolvedValue({
      id: 'participant-1',
      userId: 'invitee-1',
      gameRoomId: 'room-1',
      membershipStatus: GameRoomParticipantMembershipStatus.DENIED,
      gameRoom: {
        id: 'room-1',
        status: GameRoomStatus.WAITING,
      },
    } as GameRoomParticipantEntity);

    await expect(
      service.acceptInvitation({
        actorUserId: 'invitee-1',
        participantId: 'participant-1',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'INVALID_MEMBERSHIP_TRANSITION',
      }),
    });
  });

  it('rejects accepting an invitation when the user already belongs to another waiting room', async () => {
    participantRepository.findOne.mockResolvedValue({
      id: 'participant-1',
      userId: 'invitee-1',
      gameRoomId: 'room-1',
      membershipStatus: GameRoomParticipantMembershipStatus.INVITED,
      gameRoom: {
        id: 'room-1',
        status: GameRoomStatus.WAITING,
      },
    } as GameRoomParticipantEntity);
    participantRepository.find.mockResolvedValue([
      {
        id: 'participant-1',
        gameRoomId: 'room-1',
        membershipStatus: GameRoomParticipantMembershipStatus.INVITED,
        gameRoom: { id: 'room-1', status: GameRoomStatus.WAITING },
      } as GameRoomParticipantEntity,
      {
        id: 'participant-2',
        gameRoomId: 'room-2',
        membershipStatus: GameRoomParticipantMembershipStatus.JOINED,
        gameRoom: { id: 'room-2', status: GameRoomStatus.WAITING },
      } as GameRoomParticipantEntity,
    ]);

    await expect(
      service.acceptInvitation({
        actorUserId: 'invitee-1',
        participantId: 'participant-1',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'WAITING_ROOM_MEMBERSHIP_CONFLICT',
      }),
    });
  });

  it('persists a valid invitation', async () => {
    roomRepository.findOne.mockResolvedValue({
      id: 'room-1',
      ownerUserId: 'owner-1',
      status: GameRoomStatus.WAITING,
    } as GameRoomEntity);
    participantRepository.findOne
      .mockResolvedValueOnce({
        id: 'owner-participant-1',
        gameRoomId: 'room-1',
        userId: 'owner-1',
        role: GameRoomParticipantRole.OWNER,
        membershipStatus: GameRoomParticipantMembershipStatus.JOINED,
      } as GameRoomParticipantEntity)
      .mockResolvedValueOnce(null);
    participantRepository.findOne.mockResolvedValue(null);
    participantRepository.find.mockResolvedValue([]);
    participantRepository.create.mockReturnValue({
      gameRoomId: 'room-1',
      userId: 'invitee-1',
      role: GameRoomParticipantRole.PARTICIPANT,
      membershipStatus: GameRoomParticipantMembershipStatus.INVITED,
    } as GameRoomParticipantEntity);
    participantRepository.save.mockResolvedValue([
      {
        id: 'participant-1',
        gameRoomId: 'room-1',
        userId: 'invitee-1',
        role: GameRoomParticipantRole.PARTICIPANT,
        membershipStatus: GameRoomParticipantMembershipStatus.INVITED,
      } as GameRoomParticipantEntity,
    ] as never);

    const result = await service.inviteParticipant({
      actorUserId: 'owner-1',
      gameRoomId: 'room-1',
      invitedUserId: 'invitee-1',
    });

    expect(result.id).toBe('participant-1');
    expect(manager.query).toHaveBeenNthCalledWith(
      1,
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 1))',
      ['room-1'],
    );
    expect(manager.query).toHaveBeenNthCalledWith(
      2,
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      ['invitee-1'],
    );
    expect(manager.query).toHaveBeenNthCalledWith(
      3,
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      ['owner-1'],
    );
    expect(participantRepository.create).toHaveBeenCalledWith({
      gameRoomId: 'room-1',
      userId: 'invitee-1',
      role: GameRoomParticipantRole.PARTICIPANT,
      membershipStatus: GameRoomParticipantMembershipStatus.INVITED,
    });
    expect(realtimeRoomStateService.buildParticipantsUpdatedEvent).toHaveBeenCalledWith({
      gameRoomId: 'room-1',
      changedUserId: 'invitee-1',
    });
    expect(realtimeEventSupportService.publishRoomParticipantsUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        gameRoomId: 'room-1',
      }),
    );
  });

  it('rejects invites from an owner who already left the room', async () => {
    roomRepository.findOne.mockResolvedValue({
      id: 'room-1',
      ownerUserId: 'owner-1',
      status: GameRoomStatus.WAITING,
    } as GameRoomEntity);
    participantRepository.findOne.mockResolvedValueOnce(null);

    await expect(
      service.inviteParticipant({
        actorUserId: 'owner-1',
        gameRoomId: 'room-1',
        invitedUserId: 'invitee-1',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'GAME_ROOM_OWNER_REQUIRED',
      }),
    });
  });

  it('rejects denying an invitation after the room leaves WAITING', async () => {
    participantRepository.findOne.mockResolvedValue({
      id: 'participant-1',
      userId: 'invitee-1',
      gameRoomId: 'room-1',
      membershipStatus: GameRoomParticipantMembershipStatus.INVITED,
      gameRoom: {
        id: 'room-1',
        status: GameRoomStatus.IN_PROGRESS,
      },
    } as GameRoomParticipantEntity);

    await expect(
      service.denyInvitation({
        actorUserId: 'invitee-1',
        participantId: 'participant-1',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'ROOM_NOT_WAITING',
      }),
    });
  });

  it('marks a joined participant as LEFT on disconnect', async () => {
    const participant = {
      id: 'participant-1',
      userId: 'player-1',
      gameRoomId: 'room-1',
      membershipStatus: GameRoomParticipantMembershipStatus.JOINED,
    } as GameRoomParticipantEntity;

    roomRepository.findOne.mockResolvedValue({
      id: 'room-1',
      status: GameRoomStatus.IN_PROGRESS,
      minParticipants: 2,
    } as GameRoomEntity);
    participantRepository.findOne.mockResolvedValue(participant);
    participantRepository.save.mockImplementation(async (value) => value as GameRoomParticipantEntity);
    participantRepository.count.mockResolvedValue(1);

    const result = await service.markJoinedParticipantLeftOnDisconnect({
      gameRoomId: 'room-1',
      userId: 'player-1',
    });

    expect(result.membershipChanged).toBe(true);
    expect(participant.membershipStatus).toBe(GameRoomParticipantMembershipStatus.LEFT);
    expect(result.joinedParticipantCount).toBe(1);
    expect(realtimeRoomStateService.buildParticipantsUpdatedEvent).toHaveBeenCalledWith({
      gameRoomId: 'room-1',
      changedUserId: 'player-1',
    });
    expect(realtimeEventSupportService.publishRoomParticipantsUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        gameRoomId: 'room-1',
      }),
    );
  });
});
