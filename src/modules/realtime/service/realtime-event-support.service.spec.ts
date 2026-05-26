import { AiRealtimeEventType } from '@shared/enums';
import type { RealtimeGateway } from '../gateway/realtime.gateway';
import type {
  RealtimeAssistiveMessageService,
  RealtimeSupportStateStore,
} from './realtime.interfaces';
import { RealtimeEventSupportService } from './realtime-event-support.service';

describe('RealtimeEventSupportService', () => {
  let realtimeGateway: jest.Mocked<Pick<RealtimeGateway, 'emitToRoom'>>;
  let assistiveMessageService: jest.Mocked<RealtimeAssistiveMessageService>;
  let supportStateStore: jest.Mocked<RealtimeSupportStateStore>;
  let service: RealtimeEventSupportService;

  beforeEach(() => {
    realtimeGateway = {
      emitToRoom: jest.fn(),
    };
    assistiveMessageService = {
      buildNotice: jest.fn().mockResolvedValue(null),
    };
    supportStateStore = {
      saveCurrentTurnState: jest.fn().mockResolvedValue(undefined),
      getCurrentTurnState: jest.fn(),
      saveLatestFileContent: jest.fn(),
      getLatestFileContent: jest.fn(),
      listLatestFileContents: jest.fn(),
      clearLatestFileContents: jest.fn().mockResolvedValue(undefined),
    };

    service = new RealtimeEventSupportService(
      realtimeGateway as unknown as RealtimeGateway,
      assistiveMessageService,
      supportStateStore,
    );
  });

  it('publishes canonical realtime event names for turn lifecycle and result hooks', async () => {
    await service.publishGameStarted({
      gameRoomId: 'room-1',
      gameState: {
        status: 'IN_PROGRESS',
        turnState: {
          turnId: 'turn-1',
          currentPlayerId: 'user-1',
        },
      },
      missionState: {
        missionId: 'mission-1',
        projectStructure: {
          files: [
            {
              filePath: 'main.py',
              content: 'print("hello")\n',
            },
          ],
        },
      },
      uiHints: {
        enterGameScreen: true,
      },
      occurredAt: '2026-05-22T09:59:59+09:00',
    });
    service.publishTurnSubmit({
      gameRoomId: 'room-1',
      turnId: 'turn-1',
      userId: 'user-1',
      occurredAt: '2026-05-22T10:00:00+09:00',
    });
    await service.publishTurnEvaluated({
      gameRoomId: 'room-1',
      evaluatedTurn: {
        turnId: 'turn-1',
        playerUserId: 'user-1',
        status: 'SUBMITTED',
      },
      evaluationResult: {
        executionStatus: 'SUCCESS',
      },
      occurredAt: '2026-05-22T10:00:01+09:00',
    });
    await service.publishTurnChanged({
      gameRoomId: 'room-1',
      previousTurnId: 'turn-1',
      currentTurnId: 'turn-2',
      currentTurnUserId: 'user-2',
      occurredAt: '2026-05-22T10:00:02+09:00',
    });
    await service.publishGameStateUpdated({
      gameRoomId: 'room-1',
      gameState: {
        status: 'IN_PROGRESS',
        turnState: {
          turnId: 'turn-2',
          currentPlayerId: 'user-2',
        },
      },
      occurredAt: '2026-05-22T10:00:03+09:00',
    });
    await service.publishMissionResult({
      gameRoomId: 'room-1',
      missionResult: {
        missionId: 'mission-1',
        judgeStatus: 'CLEARED',
      },
      occurredAt: '2026-05-22T10:00:04+09:00',
    });

    expect(realtimeGateway.emitToRoom.mock.calls).toEqual([
      [
        'room-1',
        'game-started',
        {
          gameRoomId: 'room-1',
          gameState: {
            status: 'IN_PROGRESS',
            turnState: {
              turnId: 'turn-1',
              currentPlayerId: 'user-1',
            },
          },
          missionState: {
            missionId: 'mission-1',
            projectStructure: {
              files: [
                {
                  filePath: 'main.py',
                  content: 'print("hello")\n',
                },
              ],
            },
          },
          uiHints: {
            enterGameScreen: true,
          },
          occurredAt: '2026-05-22T09:59:59+09:00',
        },
      ],
      [
        'room-1',
        'turn-submit',
        {
          gameRoomId: 'room-1',
          turnId: 'turn-1',
          userId: 'user-1',
          occurredAt: '2026-05-22T10:00:00+09:00',
        },
      ],
      [
        'room-1',
        'turn-evaluated',
        {
          gameRoomId: 'room-1',
          evaluatedTurn: {
            turnId: 'turn-1',
            playerUserId: 'user-1',
            status: 'SUBMITTED',
          },
          evaluationResult: {
            executionStatus: 'SUCCESS',
          },
          occurredAt: '2026-05-22T10:00:01+09:00',
        },
      ],
      [
        'room-1',
        'turn-changed',
        {
          gameRoomId: 'room-1',
          previousTurnId: 'turn-1',
          currentTurnId: 'turn-2',
          currentTurnUserId: 'user-2',
          occurredAt: '2026-05-22T10:00:02+09:00',
        },
      ],
      [
        'room-1',
        'game-state-updated',
        {
          gameRoomId: 'room-1',
          gameState: {
            status: 'IN_PROGRESS',
            turnState: {
              turnId: 'turn-2',
              currentPlayerId: 'user-2',
            },
          },
          occurredAt: '2026-05-22T10:00:03+09:00',
        },
      ],
      [
        'room-1',
        'mission-result',
        {
          gameRoomId: 'room-1',
          missionResult: {
            judgeStatus: 'CLEARED',
            missionId: 'mission-1',
          },
          occurredAt: '2026-05-22T10:00:04+09:00',
        },
      ],
    ]);
  });

  it('syncs current turn support state from game-started payloads', async () => {
    await service.publishGameStarted({
      gameRoomId: 'room-1',
      gameState: {
        status: 'IN_PROGRESS',
        turnState: {
          turnId: 'turn-1',
          currentPlayerId: 'user-1',
        },
      },
      missionState: {
        missionId: 'mission-1',
        projectStructure: {
          files: [
            {
              filePath: 'main.py',
              content: 'print("hello")\n',
            },
          ],
        },
      },
      uiHints: {
        enterGameScreen: true,
      },
      occurredAt: '2026-05-22T09:59:59+09:00',
    });

    expect(supportStateStore.saveCurrentTurnState).toHaveBeenCalledWith({
      gameRoomId: 'room-1',
      currentTurnId: 'turn-1',
      currentTurnUserId: 'user-1',
    });
    expect(supportStateStore.saveLatestFileContent).toHaveBeenCalledWith({
      gameRoomId: 'room-1',
      turnId: 'turn-1',
      userId: 'user-1',
      filePath: 'main.py',
      content: 'print("hello")\n',
      occurredAt: '2026-05-22T09:59:59+09:00',
    });
  });

  it('attaches canonical AI assistive notices when available', async () => {
    assistiveMessageService.buildNotice.mockResolvedValue({
      type: AiRealtimeEventType.MISSION_FEEDBACK,
      message: '테스트 입력 기준으로 한 줄 요약입니다.',
      metadata: {
        source: 'llm',
      },
    });

    await service.publishTurnEvaluated({
      gameRoomId: 'room-1',
      evaluatedTurn: {
        turnId: 'turn-1',
        playerUserId: 'user-1',
        status: 'SUBMITTED',
      },
      evaluationResult: {
        executionStatus: 'FAILED',
      },
      occurredAt: '2026-05-22T10:00:01+09:00',
    });

    expect(realtimeGateway.emitToRoom).toHaveBeenCalledWith('room-1', 'turn-evaluated', {
      gameRoomId: 'room-1',
      evaluatedTurn: {
        turnId: 'turn-1',
        playerUserId: 'user-1',
        status: 'SUBMITTED',
      },
      evaluationResult: {
        executionStatus: 'FAILED',
      },
      occurredAt: '2026-05-22T10:00:01+09:00',
      aiNotice: {
        type: AiRealtimeEventType.MISSION_FEEDBACK,
        message: '테스트 입력 기준으로 한 줄 요약입니다.',
        metadata: {
          source: 'llm',
        },
      },
    });
  });

  it('does not block canonical event emission when assistive notice generation fails', async () => {
    assistiveMessageService.buildNotice.mockRejectedValue(
      new Error('llm timeout'),
    );

    await service.publishMissionResult({
      gameRoomId: 'room-1',
      missionResult: {
        missionId: 'mission-1',
        judgeStatus: 'FAILED',
      },
      occurredAt: '2026-05-22T10:00:04+09:00',
    });

    expect(realtimeGateway.emitToRoom).toHaveBeenCalledWith('room-1', 'mission-result', {
      gameRoomId: 'room-1',
      missionResult: {
        missionId: 'mission-1',
        judgeStatus: 'FAILED',
      },
      occurredAt: '2026-05-22T10:00:04+09:00',
    });
  });

  it('updates current turn support state and clears the previous turn buffer on turn change', async () => {
    await service.publishTurnChanged({
      gameRoomId: 'room-1',
      previousTurnId: 'turn-1',
      currentTurnId: 'turn-2',
      currentTurnUserId: 'user-2',
      missionState: {
        projectStructure: {
          files: [
            {
              filePath: 'main.py',
              content: 'print("next")\n',
            },
          ],
        },
      },
      occurredAt: '2026-05-22T10:00:02+09:00',
    });

    expect(supportStateStore.saveCurrentTurnState).toHaveBeenCalledWith({
      gameRoomId: 'room-1',
      currentTurnId: 'turn-2',
      currentTurnUserId: 'user-2',
    });
    expect(supportStateStore.clearLatestFileContents).toHaveBeenCalledWith({
      gameRoomId: 'room-1',
      turnId: 'turn-1',
    });
    expect(supportStateStore.saveLatestFileContent).toHaveBeenCalledWith({
      gameRoomId: 'room-1',
      turnId: 'turn-2',
      userId: 'user-2',
      filePath: 'main.py',
      content: 'print("next")\n',
      occurredAt: '2026-05-22T10:00:02+09:00',
    });
  });

  it('does not block canonical broadcasts when support-state sync fails', async () => {
    supportStateStore.saveCurrentTurnState.mockRejectedValue(
      new Error('redis unavailable'),
    );
    supportStateStore.clearLatestFileContents.mockRejectedValue(
      new Error('redis unavailable'),
    );

    await service.publishTurnChanged({
      gameRoomId: 'room-1',
      previousTurnId: 'turn-1',
      currentTurnId: 'turn-2',
      currentTurnUserId: 'user-2',
      occurredAt: '2026-05-22T10:00:02+09:00',
    });

    expect(realtimeGateway.emitToRoom).toHaveBeenCalledWith('room-1', 'turn-changed', {
      gameRoomId: 'room-1',
      previousTurnId: 'turn-1',
      currentTurnId: 'turn-2',
      currentTurnUserId: 'user-2',
      occurredAt: '2026-05-22T10:00:02+09:00',
    });
  });
});
