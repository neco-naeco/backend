/// <reference types="jest" />

import { In, Repository } from 'typeorm';
import { GameRoomEntity } from '@modules/game-rooms/entity/game-room.entity';
import { GameRoomParticipantsService } from './game-room-participants.service';
import { GameRoomParticipantEntity } from '../entity/game-room-participant.entity';
import {
  GameRoomParticipantMembershipStatus,
  GameRoomParticipantRole,
  GameRoomStatus,
} from '@shared/enums';

describe('GameRoomParticipantsService', () => {
  let service: GameRoomParticipantsService;
  let participantRepository: jest.Mocked<
    Pick<Repository<GameRoomParticipantEntity>, 'create' | 'save' | 'find' | 'findOne'>
  >;
  let roomRepository: jest.Mocked<Pick<Repository<GameRoomEntity>, 'findOne'>>;
  let manager: { getRepository: jest.Mock; query: jest.Mock };
  let dataSource: { transaction: jest.Mock; getRepository: jest.Mock };

  beforeEach(() => {
    participantRepository = {
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

    service = new GameRoomParticipantsService(dataSource as never);
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

    const result = await service.listParticipantsForUser('owner-1');

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
    expect(result.map((participant) => participant.id)).toEqual([
      'participant-1',
      'participant-2',
    ]);
  });

  it('returns an empty participant list when the authenticated user has no accessible room', async () => {
    participantRepository.find.mockResolvedValueOnce([]);

    await expect(service.listParticipantsForUser('owner-1')).resolves.toEqual([]);
    expect(participantRepository.find).toHaveBeenCalledTimes(1);
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
    participantRepository.save.mockResolvedValue({
      id: 'participant-1',
      gameRoomId: 'room-1',
      userId: 'invitee-1',
      role: GameRoomParticipantRole.PARTICIPANT,
      membershipStatus: GameRoomParticipantMembershipStatus.INVITED,
    } as GameRoomParticipantEntity);

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
});
