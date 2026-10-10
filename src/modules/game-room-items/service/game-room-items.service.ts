import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { DataSource } from 'typeorm';
import { toSeoulIso } from '@common/utils/date.util';
import { User } from '@modules/auth/entity/user.entity';
import { GameRoomParticipantEntity } from '@modules/game-room-participants/entity/game-room-participant.entity';
import { GameRoomEntity } from '@modules/game-rooms/entity/game-room.entity';
import { TurnEntity } from '@modules/turns/entity/turn.entity';
import { GameItemType, GameRoomParticipantMembershipStatus, GameRoomStatus, TurnStatus } from '@shared/enums';
import { GameRoomItemEntity } from '../entity/game-room-item.entity';

export interface UseGameItemInput {
  gameRoomId: string;
  turnId: string;
  itemType: GameItemType;
  /** Trusted authenticated caller identity, never copied from the request body. */
  userId: string;
}

export interface GameItemUseResult {
  gameRoomId: string;
  turnId: string;
  itemType: GameItemType;
  usedBy: { userId: string; nickname: string };
  remainingQuantity: number;
  effect: { addedSeconds: 30; deadlineAt: string };
  occurredAt: string;
}

@Injectable()
export class GameRoomItemsService {
  constructor(private readonly dataSource: DataSource) {}

  // The transport must authenticate and check the socket's bound room before calling.
  // This promise resolves only after commit; publication belongs to the caller.
  async useItem(input: UseGameItemInput): Promise<GameItemUseResult> {
    if (!isUUID(input.gameRoomId) || !isUUID(input.turnId) || input.itemType !== GameItemType.TIME_EXTENSION_30) {
      throw new BadRequestException({ code: 'INVALID_GAME_ITEM_REQUEST', message: 'Invalid game item request.' });
    }
    if (!isUUID(input.userId)) {
      throw new UnauthorizedException({ code: 'AUTH_REQUIRED', message: 'An authenticated user is required.' });
    }

    return this.dataSource.transaction(async (manager) => {
      // Same order as TurnsService: advisory lock, then turn row, then inventory.
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 2))', [input.turnId]);
      const turns = manager.getRepository(TurnEntity);
      const turn = await turns.findOne({
        where: { id: input.turnId, gameRoomId: input.gameRoomId },
        lock: { mode: 'pessimistic_write' },
      });
      const participant = await manager.getRepository(GameRoomParticipantEntity).findOne({
        where: {
          gameRoomId: input.gameRoomId,
          userId: input.userId,
          membershipStatus: GameRoomParticipantMembershipStatus.JOINED,
        },
      });
      if (!participant) {
        throw new ForbiddenException({ code: 'FORBIDDEN_RESOURCE_ACCESS', message: 'Active room membership is required.' });
      }
      const room = await manager.getRepository(GameRoomEntity).findOneBy({ id: input.gameRoomId });
      if (!room) {
        throw new NotFoundException({ code: 'GAME_ROOM_NOT_FOUND', message: 'Game room was not found.' });
      }
      if (room.status !== GameRoomStatus.IN_PROGRESS) {
        throw new ConflictException({ code: 'GAME_ROOM_NOT_IN_PROGRESS', message: 'The game room is not in progress.' });
      }
      if (!turn) {
        throw new ConflictException({ code: 'TURN_MISMATCH', message: 'The turn does not belong to this room.' });
      }
      if (turn.status !== TurnStatus.IN_PROGRESS) {
        throw new ConflictException({ code: 'TURN_NOT_IN_PROGRESS', message: 'The turn is no longer in progress.' });
      }
      const currentTurn = await turns.findOne({
        where: { gameRoomId: input.gameRoomId },
        order: { turnNumber: 'DESC' },
      });
      if (currentTurn?.id !== turn.id) {
        throw new ConflictException({ code: 'TURN_MISMATCH', message: 'The requested turn is not the current turn.' });
      }
      if (turn.playerUserId !== input.userId) {
        throw new ForbiddenException({ code: 'TURN_PLAYER_REQUIRED', message: 'Only the current turn player can use an item.' });
      }
      const occurredAt = new Date();
      if (occurredAt.getTime() >= turn.deadlineAt.getTime()) {
        throw new ConflictException({ code: 'TURN_DEADLINE_EXPIRED', message: 'The turn deadline has elapsed.' });
      }
      const items = manager.getRepository(GameRoomItemEntity);
      const item = await items.findOne({
        where: { gameRoomId: input.gameRoomId, itemType: input.itemType },
        lock: { mode: 'pessimistic_write' },
      });
      if (!item || item.quantity <= 0) {
        throw new ConflictException({ code: 'GAME_ITEM_EXHAUSTED', message: 'No time extension items remain in this room.' });
      }
      const user = await manager.getRepository(User).findOneBy({ id: input.userId });
      if (!user) {
        throw new UnauthorizedException({ code: 'AUTH_REQUIRED', message: 'The authenticated user no longer exists.' });
      }

      item.quantity -= 1;
      item.usedCount += 1;
      turn.deadlineAt = new Date(turn.deadlineAt.getTime() + 30000);
      await items.save(item);
      await turns.save(turn);

      return {
        gameRoomId: room.id,
        turnId: turn.id,
        itemType: input.itemType,
        usedBy: { userId: user.id, nickname: user.nickname },
        remainingQuantity: item.quantity,
        effect: { addedSeconds: 30, deadlineAt: toSeoulIso(turn.deadlineAt) },
        occurredAt: toSeoulIso(occurredAt),
      };
    });
  }
}
