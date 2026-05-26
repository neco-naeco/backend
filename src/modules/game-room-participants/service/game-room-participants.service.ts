import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { GameRoomEntity } from '@modules/game-rooms/entity/game-room.entity';
import { GameRoomParticipantEntity } from '../entity/game-room-participant.entity';
import {
  GameRoomParticipantMembershipStatus,
  GameRoomParticipantRole,
  GameRoomStatus,
} from '@shared/enums';

interface InviteParticipantInput {
  actorUserId: string;
  gameRoomId: string;
  invitedUserId: string;
}

interface ProcessInvitationInput {
  actorUserId: string;
  participantId: string;
}

interface LeaveRoomInput {
  actorUserId: string;
  participantId: string;
}

const WAITING_MEMBERSHIP_STATUSES = [
  GameRoomParticipantMembershipStatus.INVITED,
  GameRoomParticipantMembershipStatus.JOINED,
] as const;

const ALLOWED_MEMBERSHIP_TRANSITIONS: Record<
  GameRoomParticipantMembershipStatus,
  GameRoomParticipantMembershipStatus[]
> = {
  [GameRoomParticipantMembershipStatus.INVITED]: [
    GameRoomParticipantMembershipStatus.JOINED,
    GameRoomParticipantMembershipStatus.DENIED,
  ],
  [GameRoomParticipantMembershipStatus.JOINED]: [
    GameRoomParticipantMembershipStatus.LEFT,
  ],
  [GameRoomParticipantMembershipStatus.LEFT]: [],
  [GameRoomParticipantMembershipStatus.DENIED]: [],
};

@Injectable()
export class GameRoomParticipantsService {
  constructor(private readonly dataSource: DataSource) {}

  async listParticipantsForUser(
    userId: string,
  ): Promise<GameRoomParticipantEntity[]> {
    const participantRepository = this.dataSource.getRepository(
      GameRoomParticipantEntity,
    );
    const accessibleMemberships = await participantRepository.find({
      relations: { gameRoom: true },
      where: {
        userId,
        membershipStatus: In([
          GameRoomParticipantMembershipStatus.INVITED,
          GameRoomParticipantMembershipStatus.JOINED,
        ]),
      },
      order: {
        createdAt: 'ASC',
      },
    });

    const accessibleGameRoomIds = [
      ...new Set(
        accessibleMemberships.map((membership) => membership.gameRoomId),
      ),
    ];

    if (accessibleGameRoomIds.length === 0) {
      return [];
    }

    return participantRepository.find({
      relations: { gameRoom: true },
      where: {
        gameRoomId: In(accessibleGameRoomIds),
      },
      order: {
        createdAt: 'ASC',
      },
    });
  }

  async inviteParticipant(
    input: InviteParticipantInput,
  ): Promise<GameRoomParticipantEntity> {
    return this.dataSource.transaction(async (manager) => {
      const gameRoomRepository = manager.getRepository(GameRoomEntity);
      const lockedRoom = await this.getRoomOrThrow(gameRoomRepository, input.gameRoomId);

      await this.acquireRoomLifecycleLock(manager, lockedRoom.id);
      await this.acquireWaitingRoomLocks(manager, [
        input.actorUserId,
        input.invitedUserId,
      ]);

      const participantRepository = manager.getRepository(GameRoomParticipantEntity);
      const gameRoom = await this.getRoomOrThrow(gameRoomRepository, input.gameRoomId);

      this.ensureWaitingRoom(gameRoom);
      await this.ensureActiveOwnerMembership(
        participantRepository,
        gameRoom,
        input.actorUserId,
      );

      const existingMembership = await participantRepository.findOne({
        where: {
          gameRoomId: input.gameRoomId,
          userId: input.invitedUserId,
        },
      });

      if (existingMembership) {
        throw new ConflictException({
          code: 'DUPLICATE_ROOM_MEMBERSHIP',
          message: 'User is already associated with this room.',
        });
      }

      await this.ensureNoOtherWaitingRoomMembership(
        participantRepository,
        input.invitedUserId,
      );

      const participant = participantRepository.create({
        gameRoomId: input.gameRoomId,
        userId: input.invitedUserId,
        role: GameRoomParticipantRole.PARTICIPANT,
        membershipStatus: GameRoomParticipantMembershipStatus.INVITED,
      });

      return participantRepository.save(participant);
    });
  }

  async acceptInvitation(
    input: ProcessInvitationInput,
  ): Promise<GameRoomParticipantEntity> {
    return this.dataSource.transaction(async (manager) => {
      const participantRepository = manager.getRepository(GameRoomParticipantEntity);
      const lockedParticipant = await this.getParticipantOrThrow(
        participantRepository,
        input.participantId,
      );

      await this.acquireRoomLifecycleLock(manager, lockedParticipant.gameRoomId);
      await this.acquireWaitingRoomLock(manager, input.actorUserId);

      const participant = await this.getParticipantOrThrow(
        participantRepository,
        input.participantId,
      );

      this.ensureInvitationOwner(participant, input.actorUserId);
      this.ensureMembershipTransition(
        participant.membershipStatus,
        GameRoomParticipantMembershipStatus.JOINED,
      );
      this.ensureWaitingRoom(participant.gameRoom);
      await this.ensureNoOtherWaitingRoomMembership(
        participantRepository,
        participant.userId,
        participant.gameRoomId,
      );

      participant.membershipStatus = GameRoomParticipantMembershipStatus.JOINED;

      return participantRepository.save(participant);
    });
  }

  async denyInvitation(
    input: ProcessInvitationInput,
  ): Promise<GameRoomParticipantEntity> {
    return this.dataSource.transaction(async (manager) => {
      const participantRepository = manager.getRepository(GameRoomParticipantEntity);
      const lockedParticipant = await this.getParticipantOrThrow(
        participantRepository,
        input.participantId,
      );

      await this.acquireRoomLifecycleLock(manager, lockedParticipant.gameRoomId);
      await this.acquireWaitingRoomLock(manager, input.actorUserId);

      const participant = await this.getParticipantOrThrow(
        participantRepository,
        input.participantId,
      );

      this.ensureInvitationOwner(participant, input.actorUserId);
      this.ensureMembershipTransition(
        participant.membershipStatus,
        GameRoomParticipantMembershipStatus.DENIED,
      );
      this.ensureWaitingRoom(participant.gameRoom);

      participant.membershipStatus = GameRoomParticipantMembershipStatus.DENIED;

      return participantRepository.save(participant);
    });
  }

  async leaveRoom(input: LeaveRoomInput): Promise<GameRoomParticipantEntity> {
    return this.dataSource.transaction(async (manager) => {
      const participantRepository = manager.getRepository(GameRoomParticipantEntity);
      const lockedParticipant = await this.getParticipantOrThrow(
        participantRepository,
        input.participantId,
      );

      await this.acquireRoomLifecycleLock(manager, lockedParticipant.gameRoomId);
      await this.acquireWaitingRoomLock(manager, input.actorUserId);

      const participant = await this.getParticipantOrThrow(
        participantRepository,
        input.participantId,
      );

      this.ensureInvitationOwner(participant, input.actorUserId);
      this.ensureMembershipTransition(
        participant.membershipStatus,
        GameRoomParticipantMembershipStatus.LEFT,
      );

      participant.membershipStatus = GameRoomParticipantMembershipStatus.LEFT;

      return participantRepository.save(participant);
    });
  }

  private async getRoomOrThrow(
    gameRoomRepository: Repository<GameRoomEntity>,
    gameRoomId: string,
  ): Promise<GameRoomEntity> {
    const gameRoom = await gameRoomRepository.findOne({
      where: { id: gameRoomId },
    });

    if (!gameRoom) {
      throw new NotFoundException({
        code: 'GAME_ROOM_NOT_FOUND',
        message: 'Game room was not found.',
      });
    }

    return gameRoom;
  }

  private async getParticipantOrThrow(
    participantRepository: Repository<GameRoomParticipantEntity>,
    participantId: string,
  ): Promise<GameRoomParticipantEntity> {
    const participant = await participantRepository.findOne({
      relations: { gameRoom: true },
      where: { id: participantId },
    });

    if (!participant) {
      throw new NotFoundException({
        code: 'GAME_ROOM_PARTICIPANT_NOT_FOUND',
        message: 'Game room participant was not found.',
      });
    }

    return participant;
  }

  private async ensureActiveOwnerMembership(
    participantRepository: Repository<GameRoomParticipantEntity>,
    gameRoom: GameRoomEntity,
    actorUserId: string,
  ): Promise<void> {
    const ownerMembership = await participantRepository.findOne({
      where: {
        gameRoomId: gameRoom.id,
        userId: actorUserId,
        role: GameRoomParticipantRole.OWNER,
        membershipStatus: GameRoomParticipantMembershipStatus.JOINED,
      },
    });

    if (gameRoom.ownerUserId !== actorUserId || !ownerMembership) {
      throw new ForbiddenException({
        code: 'GAME_ROOM_OWNER_REQUIRED',
        message: 'Only the room owner can perform this action.',
      });
    }
  }

  private ensureWaitingRoom(gameRoom: GameRoomEntity): void {
    if (gameRoom.status !== GameRoomStatus.WAITING) {
      throw new ConflictException({
        code: 'ROOM_NOT_WAITING',
        message: 'Room membership can only change while the room is waiting.',
      });
    }
  }

  private ensureInvitationOwner(
    participant: GameRoomParticipantEntity,
    actorUserId: string,
  ): void {
    if (participant.userId !== actorUserId) {
      throw new ForbiddenException({
        code: 'INVITED_USER_REQUIRED',
        message: 'Only the invited user can perform this action.',
      });
    }
  }

  private ensureMembershipTransition(
    currentStatus: GameRoomParticipantMembershipStatus,
    nextStatus: GameRoomParticipantMembershipStatus,
  ): void {
    const allowedStatuses = ALLOWED_MEMBERSHIP_TRANSITIONS[currentStatus];

    if (!allowedStatuses.includes(nextStatus)) {
      throw new ConflictException({
        code: 'INVALID_MEMBERSHIP_TRANSITION',
        message: `Cannot change membership from ${currentStatus} to ${nextStatus}.`,
      });
    }
  }

  private async ensureNoOtherWaitingRoomMembership(
    participantRepository: Repository<GameRoomParticipantEntity>,
    userId: string,
    excludedGameRoomId?: string,
  ): Promise<void> {
    const waitingMemberships = await participantRepository.find({
      relations: { gameRoom: true },
      where: {
        userId,
        membershipStatus: In([...WAITING_MEMBERSHIP_STATUSES]),
        gameRoom: {
          status: GameRoomStatus.WAITING,
        },
      },
    });

    const conflictingMembership = waitingMemberships.find(
      (membership) => membership.gameRoomId !== excludedGameRoomId,
    );

    if (conflictingMembership) {
      throw new ConflictException({
        code: 'WAITING_ROOM_MEMBERSHIP_CONFLICT',
        message: 'User already belongs to another waiting room.',
      });
    }
  }

  private async acquireWaitingRoomLock(
    manager: EntityManager,
    userId: string,
  ): Promise<void> {
    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [userId],
    );
  }

  private async acquireRoomLifecycleLock(
    manager: EntityManager,
    gameRoomId: string,
  ): Promise<void> {
    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 1))',
      [gameRoomId],
    );
  }

  private async acquireWaitingRoomLocks(
    manager: EntityManager,
    userIds: string[],
  ): Promise<void> {
    const uniqueUserIds = [...new Set(userIds)].sort();

    for (const userId of uniqueUserIds) {
      await this.acquireWaitingRoomLock(manager, userId);
    }
  }
}
