import { DataSource } from 'typeorm';
import { TurnStatus } from '@shared/enums';
import { TurnEntity } from '@modules/turns/entity/turn.entity';
import { TurnsService } from '@modules/turns/service/turns.service';
import type { RealtimeSupportStateStore } from './realtime.interfaces';
import { RealtimeEventSupportService } from './realtime-event-support.service';
import { RealtimeTurnTimeoutService } from './realtime-turn-timeout.service';

describe('RealtimeTurnTimeoutService', () => {
  it('runs the timeout lifecycle for expired in-progress turns', async () => {
    const dataSource = {
      getRepository: jest.fn().mockReturnValue({
        find: jest.fn().mockResolvedValue([
          {
            id: 'turn-1',
            gameRoomId: 'room-1',
            playerUserId: 'user-1',
            status: TurnStatus.IN_PROGRESS,
            deadlineAt: new Date('2026-05-26T01:00:00.000Z'),
          } as TurnEntity,
        ]),
      }),
    } as unknown as DataSource;
    const turnsService: jest.Mocked<Pick<TurnsService, 'timeoutTurn'>> = {
      timeoutTurn: jest.fn().mockResolvedValue({
        submitEvent: {
          gameRoomId: 'room-1',
          turnId: 'turn-1',
          userId: 'user-1',
          occurredAt: '2026-05-26T10:00:00+09:00',
        },
        evaluatedEvent: {
          gameRoomId: 'room-1',
          evaluatedTurn: {
            turnId: 'turn-1',
            playerUserId: 'user-1',
            status: TurnStatus.TIMEOUT,
          },
          evaluationResult: {
            judgeStatus: 'FAILED',
          },
          occurredAt: '2026-05-26T10:00:00+09:00',
        },
        turnChangedEvent: null,
        missionResultEvent: null,
        gameStateUpdatedEvent: {
          gameRoomId: 'room-1',
          gameState: {
            status: 'IN_PROGRESS',
          },
          occurredAt: '2026-05-26T10:00:00+09:00',
        },
      }),
    };
    const realtimeEventSupportService: jest.Mocked<
      Pick<
        RealtimeEventSupportService,
        | 'publishTurnSubmit'
        | 'publishTurnEvaluated'
        | 'publishTurnChanged'
        | 'publishMissionResult'
        | 'publishGameStateUpdated'
      >
    > = {
      publishTurnSubmit: jest.fn(),
      publishTurnEvaluated: jest.fn().mockResolvedValue(undefined),
      publishTurnChanged: jest.fn().mockResolvedValue(undefined),
      publishMissionResult: jest.fn().mockResolvedValue(undefined),
      publishGameStateUpdated: jest.fn().mockResolvedValue(undefined),
    };
    const supportStateStore: jest.Mocked<RealtimeSupportStateStore> = {
      saveCurrentTurnState: jest.fn(),
      getCurrentTurnState: jest.fn(),
      saveLatestFileContent: jest.fn(),
      getLatestFileContent: jest.fn(),
      listLatestFileContents: jest.fn().mockResolvedValue([
        {
          gameRoomId: 'room-1',
          turnId: 'turn-1',
          userId: 'user-1',
          filePath: 'main.py',
          content: 'print("timeout")\n',
          occurredAt: '2026-05-26T09:59:59+09:00',
        },
      ]),
      clearLatestFileContents: jest.fn(),
    };
    const service = new RealtimeTurnTimeoutService(
      dataSource,
      turnsService as unknown as TurnsService,
      realtimeEventSupportService as unknown as RealtimeEventSupportService,
      supportStateStore,
    );

    await service.processExpiredTurns(new Date('2026-05-26T01:00:01.000Z'));

    expect(supportStateStore.listLatestFileContents).toHaveBeenCalledWith({
      gameRoomId: 'room-1',
      turnId: 'turn-1',
    });
    expect(turnsService.timeoutTurn).toHaveBeenCalledWith({
      gameRoomId: 'room-1',
      turnId: 'turn-1',
      userId: 'user-1',
      occurredAt: '2026-05-26T01:00:01.000Z',
      files: [
        expect.objectContaining({
          filePath: 'main.py',
        }),
      ],
    });
    expect(realtimeEventSupportService.publishTurnSubmit).toHaveBeenCalled();
    expect(realtimeEventSupportService.publishTurnEvaluated).toHaveBeenCalled();
    expect(realtimeEventSupportService.publishGameStateUpdated).toHaveBeenCalled();
  });
});
