jest.mock('../gateway/realtime.gateway', () => ({
  RealtimeGateway: class RealtimeGateway {},
}));

jest.mock('./realtime-event-support.service', () => ({
  RealtimeEventSupportService: class RealtimeEventSupportService {},
}));

import { GameRoomParticipantsService } from '@modules/game-room-participants/service/game-room-participants.service';
import { GameRoomsService } from '@modules/game-rooms/service/game-rooms.service';
import { TurnEntity } from '@modules/turns/entity/turn.entity';
import { TurnsService } from '@modules/turns/service/turns.service';
import { GameRoomEntity } from '@modules/game-rooms/entity/game-room.entity';
import { GameRoomStatus, TurnStatus } from '@shared/enums';
import { DataSource } from 'typeorm';
import { DatabaseRealtimeDisconnectService } from './realtime-disconnect.service';
import { RealtimeEventSupportService } from './realtime-event-support.service';
import { RealtimeRoomStateService } from './realtime-room-state.service';

describe('DatabaseRealtimeDisconnectService', () => {
  it('marks LEFT, times out the owned turn, then finishes the room when below minParticipants', async () => {
    const gameRoomParticipantsService: jest.Mocked<
      Pick<GameRoomParticipantsService, 'markJoinedParticipantLeftOnDisconnect'>
    > = {
      markJoinedParticipantLeftOnDisconnect: jest.fn().mockResolvedValue({
        membershipChanged: true,
        joinedParticipantCount: 1,
        room: {
          id: 'room-1',
          status: GameRoomStatus.IN_PROGRESS,
          minParticipants: 2,
        } as GameRoomEntity,
      }),
    };
    const gameRoomsService: jest.Mocked<
      Pick<GameRoomsService, 'finishRoomIfBelowMinParticipants'>
    > = {
      finishRoomIfBelowMinParticipants: jest.fn().mockResolvedValue({
        finished: true,
        room: {
          id: 'room-1',
          status: GameRoomStatus.FINISHED,
        } as GameRoomEntity,
      }),
    };
    const turnsService: jest.Mocked<Pick<TurnsService, 'timeoutTurn'>> = {
      timeoutTurn: jest.fn().mockResolvedValue({
        submitEvent: { gameRoomId: 'room-1', turnId: 'turn-1', userId: 'user-1', occurredAt: '' },
        evaluatedEvent: {
          gameRoomId: 'room-1',
          evaluatedTurn: {},
          evaluationResult: {
            feedbackMessage: 'timed out',
            detectedIssues: [],
            strikeCount: 0,
            remainingStrikeCount: 3,
            executionSummary: {},
          },
          occurredAt: '',
        },
        gameStateUpdatedEvent: {
          gameRoomId: 'room-1',
          gameState: {},
          occurredAt: '',
        },
        turnChangedEvent: null,
        missionResultEvent: null,
      }),
    };
    const realtimeRoomStateService: jest.Mocked<
      Pick<RealtimeRoomStateService, 'buildParticipantsUpdatedEvent'>
    > = {
      buildParticipantsUpdatedEvent: jest.fn().mockResolvedValue({
        gameRoomId: 'room-1',
        participants: [],
        changedParticipant: null,
        gameState: { status: GameRoomStatus.FINISHED },
        missionState: null,
        occurredAt: '2026-05-27T10:00:00+09:00',
      }),
    };
    const realtimeEventSupportService: jest.Mocked<
      Pick<
        RealtimeEventSupportService,
        | 'publishTurnLifecycleResult'
        | 'publishGameStateUpdated'
      >
    > = {
      publishTurnLifecycleResult: jest.fn(),
      publishGameStateUpdated: jest.fn(),
    };
    const turnRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'turn-1',
        gameRoomId: 'room-1',
        playerUserId: 'user-1',
        status: TurnStatus.IN_PROGRESS,
      } as TurnEntity),
    };
    const dataSource = {
      getRepository: jest.fn().mockReturnValue(turnRepository),
    } as unknown as DataSource;
    const supportStateStore = {
      listLatestFileContents: jest.fn().mockResolvedValue([]),
    };
    const service = new DatabaseRealtimeDisconnectService(
      dataSource,
      gameRoomParticipantsService as unknown as GameRoomParticipantsService,
      gameRoomsService as unknown as GameRoomsService,
      turnsService as unknown as TurnsService,
      realtimeRoomStateService as unknown as RealtimeRoomStateService,
      realtimeEventSupportService as unknown as RealtimeEventSupportService,
      supportStateStore as never,
    );

    await service.handleDisconnect({
      gameRoomId: 'room-1',
      userId: 'user-1',
    });

    expect(
      gameRoomParticipantsService.markJoinedParticipantLeftOnDisconnect,
    ).toHaveBeenCalledWith({
      gameRoomId: 'room-1',
      userId: 'user-1',
    });
    expect(turnsService.timeoutTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        gameRoomId: 'room-1',
        turnId: 'turn-1',
        userId: 'user-1',
        suppressNextTurnCreation: true,
      }),
    );
    expect(realtimeEventSupportService.publishTurnLifecycleResult).toHaveBeenCalledWith(
      expect.anything(),
      { omitGameStateUpdated: true },
    );
    expect(gameRoomsService.finishRoomIfBelowMinParticipants).toHaveBeenCalledWith('room-1');
    expect(realtimeEventSupportService.publishGameStateUpdated).toHaveBeenCalled();
  });

  it('times out the owned turn when the room remains playable', async () => {
    const gameRoomParticipantsService: jest.Mocked<
      Pick<GameRoomParticipantsService, 'markJoinedParticipantLeftOnDisconnect'>
    > = {
      markJoinedParticipantLeftOnDisconnect: jest.fn().mockResolvedValue({
        membershipChanged: true,
        joinedParticipantCount: 2,
        room: {
          id: 'room-1',
          status: GameRoomStatus.IN_PROGRESS,
          minParticipants: 2,
        } as GameRoomEntity,
      }),
    };
    const gameRoomsService: jest.Mocked<
      Pick<GameRoomsService, 'finishRoomIfBelowMinParticipants'>
    > = {
      finishRoomIfBelowMinParticipants: jest.fn().mockResolvedValue({
        finished: false,
        room: {
          id: 'room-1',
          status: GameRoomStatus.IN_PROGRESS,
        } as GameRoomEntity,
      }),
    };
    const turnsService: jest.Mocked<Pick<TurnsService, 'timeoutTurn'>> = {
      timeoutTurn: jest.fn().mockResolvedValue({
        submitEvent: { gameRoomId: 'room-1', turnId: 'turn-1', userId: 'user-1', occurredAt: '' },
        evaluatedEvent: {
          gameRoomId: 'room-1',
          evaluatedTurn: {},
          evaluationResult: {
            feedbackMessage: 'timed out',
            detectedIssues: [],
            strikeCount: 0,
            remainingStrikeCount: 3,
            executionSummary: {},
          },
          occurredAt: '',
        },
        gameStateUpdatedEvent: {
          gameRoomId: 'room-1',
          gameState: {},
          occurredAt: '',
        },
        turnChangedEvent: null,
        missionResultEvent: null,
      }),
    };
    const turnRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'turn-1',
        gameRoomId: 'room-1',
        playerUserId: 'user-1',
        status: TurnStatus.IN_PROGRESS,
      } as TurnEntity),
    };
    const service = new DatabaseRealtimeDisconnectService(
      { getRepository: jest.fn().mockReturnValue(turnRepository) } as unknown as DataSource,
      gameRoomParticipantsService as unknown as GameRoomParticipantsService,
      gameRoomsService as unknown as GameRoomsService,
      turnsService as unknown as TurnsService,
      {
        buildParticipantsUpdatedEvent: jest.fn().mockResolvedValue({
          gameRoomId: 'room-1',
          participants: [],
          changedParticipant: null,
          gameState: {},
          missionState: null,
          occurredAt: '',
        }),
      } as unknown as RealtimeRoomStateService,
      {
        publishTurnLifecycleResult: jest.fn(),
        publishGameStateUpdated: jest.fn(),
      } as unknown as RealtimeEventSupportService,
      { listLatestFileContents: jest.fn().mockResolvedValue([]) } as never,
    );

    await service.handleDisconnect({
      gameRoomId: 'room-1',
      userId: 'user-1',
    });

    expect(turnsService.timeoutTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        suppressNextTurnCreation: false,
      }),
    );
  });
});
