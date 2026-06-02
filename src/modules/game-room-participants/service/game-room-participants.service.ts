import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { User } from '@modules/auth/entity/user.entity';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { GameRoomEntity } from '@modules/game-rooms/entity/game-room.entity';
import { toSeoulIso } from '@common/utils/date.util';
import { RealtimeEventSupportService } from '@modules/realtime/service/realtime-event-support.service';
import { RealtimeRoomStateService } from '@modules/realtime/service/realtime-room-state.service';
import { GameRoomParticipantEntity } from '../entity/game-room-participant.entity';
import {
  GameRoomParticipantMembershipStatus,
  GameRoomParticipantRole,
  GameRoomStatus,
} from '@shared/enums';
import { ListGameRoomParticipantsQueryDto } from '../dto/list-game-room-participants-query.dto';
import { GameRoomParticipantListItemDto } from '../dto/game-room-participant-list-item.dto';

interface InviteParticipantInput {
  actorUserId: string;
  gameRoomId: string;
  invitedUserId: string;
}

interface InviteParticipantsInput {
  actorUserId: string;
  gameRoomId: string;
  invitedUserIds: string[];
}

interface ProcessInvitationInput {
  actorUserId: string;
  participantId: string;
}

interface LeaveRoomInput {
  actorUserId: string;
  participantId: string;
}

export interface DisconnectMembershipResult {
  participant: GameRoomParticipantEntity;
  room: GameRoomEntity;
  membershipChanged: boolean;
  joinedParticipantCount: number;
}

const WAITING_MEMBERSHIP_STATUSES = [
  GameRoomParticipantMembershipStatus.INVITED,
  GameRoomParticipantMembershipStatus.JOINED,
] as const;
const DEFAULT_GAME_ROOM_TITLE = '대기방';

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
  private readonly logger = new Logger(GameRoomParticipantsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly moduleRef?: ModuleRef,
  ) {}

  async listParticipantsForUser(input: {
    authenticatedUserId: string;
    query: ListGameRoomParticipantsQueryDto;
  }): Promise<GameRoomParticipantListItemDto[]> {
    const participantRepository = this.dataSource.getRepository(
      GameRoomParticipantEntity,
    );

    if (
      input.query.userId !== undefined &&
      input.query.userId !== input.authenticatedUserId
    ) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_RESOURCE_ACCESS',
        message: 'userId does not match the authenticated user.',
      });
    }

    const accessibleMemberships = await participantRepository.find({
      relations: { gameRoom: true },
      where: {
        userId: input.authenticatedUserId,
        membershipStatus: In([
          GameRoomParticipantMembershipStatus.INVITED,
          GameRoomParticipantMembershipStatus.JOINED,
        ]),
        ...(input.query.gameRoomId
          ? { gameRoomId: input.query.gameRoomId }
          : {}),
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

    const participants = await participantRepository.find({
      relations: { gameRoom: true },
      where: {
        gameRoomId: In(accessibleGameRoomIds),
        ...(input.query.membershipStatus
          ? { membershipStatus: input.query.membershipStatus }
          : {}),
      },
      order: {
        createdAt: 'ASC',
      },
    });

    const nicknameByUserId = await this.loadNicknameByUserId(
      participants.map((participant) => participant.userId),
    );

    return participants.map((participant) => ({
      id: participant.id,
      gameRoomId: participant.gameRoomId,
      gameRoomTitle: DEFAULT_GAME_ROOM_TITLE,
      userId: participant.userId,
      nickname: nicknameByUserId.get(participant.userId) ?? participant.userId,
      role: participant.role,
      membershipStatus: participant.membershipStatus,
      status: participant.membershipStatus,
      roomStatus: participant.gameRoom.status,
      createdAt: toSeoulIso(participant.createdAt),
      updatedAt: toSeoulIso(participant.updatedAt),
    }));
  }

  async inviteParticipant(
    input: InviteParticipantInput,
  ): Promise<GameRoomParticipantEntity> {
    const [participant] = await this.inviteParticipants({
      actorUserId: input.actorUserId,
      gameRoomId: input.gameRoomId,
      invitedUserIds: [input.invitedUserId],
    });

    return participant;
  }

  async inviteParticipants(
    input: InviteParticipantsInput,
  ): Promise<GameRoomParticipantEntity[]> {
    const participants = await this.dataSource.transaction(async (manager) => {
      const invitedUserIds = [...new Set(input.invitedUserIds)];

      if (invitedUserIds.length === 0) {
        return [];
      }

      const gameRoomRepository = manager.getRepository(GameRoomEntity);
      const lockedRoom = await this.getRoomOrThrow(gameRoomRepository, input.gameRoomId);

      await this.acquireRoomLifecycleLock(manager, lockedRoom.id);
      await this.acquireWaitingRoomLocks(manager, [
        input.actorUserId,
        ...invitedUserIds,
      ]);

      const participantRepository = manager.getRepository(GameRoomParticipantEntity);
      const gameRoom = await this.getRoomOrThrow(gameRoomRepository, input.gameRoomId);

      this.ensureWaitingRoom(gameRoom);
      await this.ensureActiveOwnerMembership(
        participantRepository,
        gameRoom,
        input.actorUserId,
      );

      const participantsToCreate: GameRoomParticipantEntity[] = [];

      for (const invitedUserId of invitedUserIds) {
        const existingMembership = await participantRepository.findOne({
          where: {
            gameRoomId: input.gameRoomId,
            userId: invitedUserId,
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
          invitedUserId,
        );

        participantsToCreate.push(
          participantRepository.create({
            gameRoomId: input.gameRoomId,
            userId: invitedUserId,
            role: GameRoomParticipantRole.PARTICIPANT,
            membershipStatus: GameRoomParticipantMembershipStatus.INVITED,
          }),
        );
      }

      return participantRepository.save(participantsToCreate);
    });

    await this.publishParticipantsUpdatedBestEffort({
      gameRoomId: input.gameRoomId,
      changedUserId: participants.length === 1 ? participants[0].userId : undefined,
    });

    return participants;
  }

  async acceptInvitation(
    input: ProcessInvitationInput,
  ): Promise<GameRoomParticipantEntity> {
    const participant = await this.dataSource.transaction(async (manager) => {
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

    await this.publishParticipantsUpdatedBestEffort({
      gameRoomId: participant.gameRoomId,
      changedUserId: participant.userId,
    });

    return participant;
  }

  async denyInvitation(
    input: ProcessInvitationInput,
  ): Promise<GameRoomParticipantEntity> {
    const participant = await this.dataSource.transaction(async (manager) => {
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

    await this.publishParticipantsUpdatedBestEffort({
      gameRoomId: participant.gameRoomId,
      changedUserId: participant.userId,
    });

    return participant;
  }

  async markJoinedParticipantLeftOnDisconnect(input: {
    gameRoomId: string;
    userId: string;
  }): Promise<DisconnectMembershipResult> {
    const result = await this.dataSource.transaction(async (manager) => {
      const participantRepository = manager.getRepository(GameRoomParticipantEntity);
      const gameRoomRepository = manager.getRepository(GameRoomEntity);

      await this.acquireRoomLifecycleLock(manager, input.gameRoomId);

      const room = await this.getRoomOrThrow(gameRoomRepository, input.gameRoomId);
      const participant = await participantRepository.findOne({
        where: {
          gameRoomId: input.gameRoomId,
          userId: input.userId,
        },
      });

      if (!participant) {
        throw new NotFoundException({
          code: 'GAME_ROOM_PARTICIPANT_NOT_FOUND',
          message: 'Game room participant was not found.',
        });
      }

      let membershipChanged = false;

      if (
        participant.membershipStatus === GameRoomParticipantMembershipStatus.JOINED
      ) {
        participant.membershipStatus = GameRoomParticipantMembershipStatus.LEFT;
        await participantRepository.save(participant);
        membershipChanged = true;
      }

      const joinedParticipantCount = await participantRepository.count({
        where: {
          gameRoomId: input.gameRoomId,
          membershipStatus: GameRoomParticipantMembershipStatus.JOINED,
        },
      });

      return {
        participant,
        room,
        membershipChanged,
        joinedParticipantCount,
      };
    });

    if (result.membershipChanged) {
      await this.publishParticipantsUpdatedBestEffort({
        gameRoomId: input.gameRoomId,
        changedUserId: input.userId,
      });
    }

    return result;
  }

  async leaveRoom(input: LeaveRoomInput): Promise<GameRoomParticipantEntity> {
    const participant = await this.dataSource.transaction(async (manager) => {
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

    await this.publishParticipantsUpdatedBestEffort({
      gameRoomId: participant.gameRoomId,
      changedUserId: participant.userId,
    });

    return participant;
  }

  private async publishParticipantsUpdatedBestEffort(input: {
    gameRoomId: string;
    changedUserId?: string;
  }): Promise<void> {
    if (!this.moduleRef) {
      return;
    }

    try {
      const realtimeRoomStateService = this.moduleRef.get(RealtimeRoomStateService, {
        strict: false,
      });
      const realtimeEventSupportService = this.moduleRef.get(
        RealtimeEventSupportService,
        {
          strict: false,
        },
      );
      const event = await realtimeRoomStateService.buildParticipantsUpdatedEvent({
        gameRoomId: input.gameRoomId,
        changedUserId: input.changedUserId,
      });

      realtimeEventSupportService.publishRoomParticipantsUpdated(event);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'unknown participants realtime publish error';
      this.logger.warn(
        `Failed to publish room-participants-updated for ${input.gameRoomId}: ${message}`,
      );
    }
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

  private async loadNicknameByUserId(
    userIds: string[],
  ): Promise<Map<string, string>> {
    const uniqueUserIds = [...new Set(userIds)];

    if (uniqueUserIds.length === 0) {
      return new Map();
    }

    const users = await this.dataSource.getRepository(User).find({
      where: {
        id: In(uniqueUserIds),
      },
    });

    return new Map(users.map((user) => [user.id, user.nickname] as const));
  }
}
