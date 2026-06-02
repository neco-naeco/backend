import { Inject, Injectable, Logger } from '@nestjs/common';
import { toSeoulIso } from '@common/utils/date.util';
import { GameRoomParticipantsService } from '@modules/game-room-participants/service/game-room-participants.service';
import { GameRoomsService } from '@modules/game-rooms/service/game-rooms.service';
import { TurnEntity } from '@modules/turns/entity/turn.entity';
import { TurnsService } from '@modules/turns/service/turns.service';
import { GameRoomStatus, TurnStatus } from '@shared/enums';
import { DataSource } from 'typeorm';
import { REALTIME_SUPPORT_STATE_STORE } from './realtime.constants';
import type {
  RealtimeDisconnectService,
  RealtimeSupportStateStore,
} from './realtime.interfaces';
import { RealtimeEventSupportService } from './realtime-event-support.service';
import { RealtimeRoomStateService } from './realtime-room-state.service';

@Injectable()
export class DatabaseRealtimeDisconnectService implements RealtimeDisconnectService {
  private readonly logger = new Logger(DatabaseRealtimeDisconnectService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly gameRoomParticipantsService: GameRoomParticipantsService,
    private readonly gameRoomsService: GameRoomsService,
    private readonly turnsService: TurnsService,
    private readonly realtimeRoomStateService: RealtimeRoomStateService,
    private readonly realtimeEventSupportService: RealtimeEventSupportService,
    @Inject(REALTIME_SUPPORT_STATE_STORE)
    private readonly supportStateStore: RealtimeSupportStateStore,
  ) {}

  async handleDisconnect(input: {
    gameRoomId: string;
    userId: string;
  }): Promise<void> {
    const disconnectResult =
      await this.gameRoomParticipantsService.markJoinedParticipantLeftOnDisconnect(
        input,
      );

    if (!disconnectResult.membershipChanged) {
      return;
    }

    const currentTurn = await this.findCurrentTurn(input.gameRoomId);
    const shouldTimeoutCurrentTurn =
      disconnectResult.room.status === GameRoomStatus.IN_PROGRESS &&
      currentTurn !== null &&
      currentTurn.playerUserId === input.userId &&
      currentTurn.status === TurnStatus.IN_PROGRESS;

    const willTerminateRoomForParticipants =
      disconnectResult.joinedParticipantCount < disconnectResult.room.minParticipants;

    if (shouldTimeoutCurrentTurn && currentTurn) {
      await this.timeoutCurrentTurn(currentTurn, willTerminateRoomForParticipants);
    }

    const finishResult =
      await this.gameRoomsService.finishRoomIfBelowMinParticipants(input.gameRoomId);

    if (finishResult.finished) {
      const gameStateUpdated =
        await this.realtimeRoomStateService.buildParticipantsUpdatedEvent({
          gameRoomId: input.gameRoomId,
        });
      await this.realtimeEventSupportService.publishGameStateUpdated({
        gameRoomId: input.gameRoomId,
        gameState: gameStateUpdated.gameState,
        missionState: gameStateUpdated.missionState,
        occurredAt: toSeoulIso(new Date()),
      });
    }
  }

  private async findCurrentTurn(gameRoomId: string): Promise<TurnEntity | null> {
    return this.dataSource.getRepository(TurnEntity).findOne({
      where: {
        gameRoomId,
        status: TurnStatus.IN_PROGRESS,
      },
      order: {
        turnNumber: 'DESC',
      },
    });
  }

  private async timeoutCurrentTurn(
    turn: TurnEntity,
    suppressNextTurnCreation: boolean,
  ): Promise<void> {
    try {
      const files = await this.supportStateStore.listLatestFileContents({
        gameRoomId: turn.gameRoomId,
        turnId: turn.id,
      });
      const result = await this.turnsService.timeoutTurn({
        gameRoomId: turn.gameRoomId,
        turnId: turn.id,
        userId: turn.playerUserId,
        occurredAt: toSeoulIso(new Date()),
        files,
        suppressNextTurnCreation,
      });

      await this.realtimeEventSupportService.publishTurnLifecycleResult(result, {
        omitGameStateUpdated: suppressNextTurnCreation,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'unknown disconnect timeout error';
      this.logger.warn(
        `Failed to timeout turn ${turn.id} after disconnect: ${message}`,
      );
    }
  }
}
