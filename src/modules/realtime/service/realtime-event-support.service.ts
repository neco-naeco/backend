import { Inject, Injectable, Logger } from '@nestjs/common';
import { AiRealtimeEventType } from '@shared/enums';
import { RealtimeGateway } from '../gateway/realtime.gateway';
import {
  REALTIME_ASSISTIVE_MESSAGE_SERVICE,
  REALTIME_EVENT,
  REALTIME_SUPPORT_STATE_STORE,
} from './realtime.constants';
import type {
  GameStartedEvent,
  GameStateUpdatedEvent,
  MissionResultEvent,
  RealtimeAssistiveMessageService,
  RealtimeAssistiveNotice,
  RealtimeSupportStateStore,
  TurnChangedEvent,
  TurnEvaluatedEvent,
  TurnSubmitEvent,
} from './realtime.interfaces';

@Injectable()
export class RealtimeEventSupportService {
  private readonly logger = new Logger(RealtimeEventSupportService.name);

  constructor(
    private readonly realtimeGateway: RealtimeGateway,
    @Inject(REALTIME_ASSISTIVE_MESSAGE_SERVICE)
    private readonly assistiveMessageService: RealtimeAssistiveMessageService,
    @Inject(REALTIME_SUPPORT_STATE_STORE)
    private readonly supportStateStore: RealtimeSupportStateStore,
  ) {}

  publishTurnSubmit(event: TurnSubmitEvent): void {
    this.realtimeGateway.emitToRoom(event.gameRoomId, REALTIME_EVENT.TURN_SUBMIT, event);
  }

  async publishGameStarted(event: GameStartedEvent): Promise<void> {
    const currentTurnId = getCurrentTurnId(event.gameState);
    const currentTurnUserId = getCurrentTurnUserId(event.gameState);

    await this.saveCurrentTurnStateBestEffort({
      gameRoomId: event.gameRoomId,
      currentTurnId,
      currentTurnUserId,
    });
    await this.seedInitialFileBuffersBestEffort({
      gameRoomId: event.gameRoomId,
      turnId: currentTurnId,
      userId: currentTurnUserId,
      missionState: event.missionState,
      occurredAt: event.occurredAt,
    });

    this.realtimeGateway.emitToRoom(
      event.gameRoomId,
      REALTIME_EVENT.GAME_STARTED,
      event,
    );
  }

  async publishTurnEvaluated(event: TurnEvaluatedEvent): Promise<void> {
    const enrichedEvent = await this.attachNotice(REALTIME_EVENT.TURN_EVALUATED, event, {
      gameRoomId: event.gameRoomId,
      turnId: asString(event.evaluatedTurn.turnId),
      userId: asString(event.evaluatedTurn.playerUserId),
      payload: event.evaluationResult,
    });

    this.realtimeGateway.emitToRoom(
      event.gameRoomId,
      REALTIME_EVENT.TURN_EVALUATED,
      enrichedEvent,
    );
  }

  async publishTurnChanged(event: TurnChangedEvent): Promise<void> {
    await this.saveCurrentTurnStateBestEffort({
      gameRoomId: event.gameRoomId,
      currentTurnId: event.currentTurnId,
      currentTurnUserId: event.currentTurnUserId,
    });
    await this.seedInitialFileBuffersBestEffort({
      gameRoomId: event.gameRoomId,
      turnId: event.currentTurnId,
      userId: event.currentTurnUserId,
      missionState: isRecord(event.missionState) ? event.missionState : {},
      occurredAt: event.occurredAt,
    });

    if (event.previousTurnId) {
      await this.clearLatestFileContentsBestEffort({
        gameRoomId: event.gameRoomId,
        turnId: event.previousTurnId,
      });
    }

    this.realtimeGateway.emitToRoom(
      event.gameRoomId,
      REALTIME_EVENT.TURN_CHANGED,
      event,
    );
  }

  async publishGameStateUpdated(event: GameStateUpdatedEvent): Promise<void> {
    await this.syncCurrentTurnStateFromGameStateBestEffort(event);

    const enrichedEvent = await this.attachNotice(REALTIME_EVENT.GAME_STATE_UPDATED, event, {
      gameRoomId: event.gameRoomId,
      turnId: getCurrentTurnId(event.gameState),
      userId: getCurrentTurnUserId(event.gameState),
      payload: event.gameState,
    });

    this.realtimeGateway.emitToRoom(
      event.gameRoomId,
      REALTIME_EVENT.GAME_STATE_UPDATED,
      enrichedEvent,
    );
  }

  async publishMissionResult(event: MissionResultEvent): Promise<void> {
    const enrichedEvent = await this.attachNotice(REALTIME_EVENT.MISSION_RESULT, event, {
      gameRoomId: event.gameRoomId,
      missionId: asString(event.missionResult.missionId),
      payload: event.missionResult,
    });

    this.realtimeGateway.emitToRoom(
      event.gameRoomId,
      REALTIME_EVENT.MISSION_RESULT,
      enrichedEvent,
    );
  }

  private async attachNotice<T extends { aiNotice?: RealtimeAssistiveNotice | null }>(
    event: string,
    payload: T,
    input: {
      gameRoomId: string;
      turnId?: string | null;
      missionId?: string | null;
      userId?: string | null;
      payload: Record<string, unknown>;
    },
  ): Promise<T> {
    try {
      const notice = await this.assistiveMessageService.buildNotice({
        event,
        gameRoomId: input.gameRoomId,
        turnId: input.turnId,
        missionId: input.missionId,
        userId: input.userId,
        payload: input.payload,
      });

      if (!notice) {
        return payload;
      }

      if (!isCanonicalNoticeType(notice.type)) {
        this.logger.warn(`Ignoring non-canonical AI realtime notice type: ${notice.type}`);
        return payload;
      }

      return {
        ...payload,
        aiNotice: notice,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'unknown assistive message error';
      this.logger.warn(
        `Failed to build assistive realtime notice for ${event}: ${message}`,
      );
      return payload;
    }
  }

  private async syncCurrentTurnStateFromGameStateBestEffort(
    event: GameStateUpdatedEvent,
  ): Promise<void> {
    await this.saveCurrentTurnStateBestEffort({
      gameRoomId: event.gameRoomId,
      currentTurnId: getCurrentTurnId(event.gameState),
      currentTurnUserId: getCurrentTurnUserId(event.gameState),
    });
  }

  private async saveCurrentTurnStateBestEffort(input: {
    gameRoomId: string;
    currentTurnId: string | null;
    currentTurnUserId: string | null;
  }): Promise<void> {
    try {
      await this.supportStateStore.saveCurrentTurnState(input);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'unknown current turn state sync error';
      this.logger.warn(`Failed to sync current turn support state: ${message}`);
    }
  }

  private async clearLatestFileContentsBestEffort(input: {
    gameRoomId: string;
    turnId: string;
  }): Promise<void> {
    try {
      await this.supportStateStore.clearLatestFileContents(input);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'unknown turn buffer clear error';
      this.logger.warn(`Failed to clear previous turn support buffer: ${message}`);
    }
  }

  private async seedInitialFileBuffersBestEffort(input: {
    gameRoomId: string;
    turnId: string | null;
    userId: string | null;
    missionState: Record<string, unknown>;
    occurredAt: string;
  }): Promise<void> {
    if (!input.turnId || !input.userId) {
      return;
    }

    const projectStructure = isRecord(input.missionState.projectStructure)
      ? input.missionState.projectStructure
      : null;
    const files = Array.isArray(projectStructure?.files)
      ? projectStructure.files
      : [];

    try {
      await Promise.all(
        files
          .filter((file): file is Record<string, unknown> => isRecord(file))
          .filter((file) => typeof file.filePath === 'string')
          .map((file) =>
            this.supportStateStore.saveLatestFileContent({
              gameRoomId: input.gameRoomId,
              turnId: input.turnId!,
              userId: input.userId!,
              filePath: file.filePath as string,
              content: asString(file.content) ?? '',
              occurredAt: input.occurredAt,
            }),
          ),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'unknown game-start buffer seed error';
      this.logger.warn(`Failed to seed initial mission file buffers: ${message}`);
    }
  }
}

function getCurrentTurnId(gameState: Record<string, unknown>): string | null {
  const turnState = gameState.turnState;

  if (!isRecord(turnState) || typeof turnState.turnId !== 'string') {
    return null;
  }

  return turnState.turnId;
}

function getCurrentTurnUserId(gameState: Record<string, unknown>): string | null {
  const turnState = gameState.turnState;

  if (!isRecord(turnState) || typeof turnState.currentPlayerId !== 'string') {
    return null;
  }

  return turnState.currentPlayerId;
}

function isCanonicalNoticeType(type: AiRealtimeEventType): boolean {
  return Object.values(AiRealtimeEventType).includes(type);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
