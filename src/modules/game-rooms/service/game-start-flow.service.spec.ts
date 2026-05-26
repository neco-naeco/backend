import { GameRoomMissionStepStatus, GameRoomStatus, TurnStatus } from '@shared/enums';
import { RealtimeEventSupportService } from '@modules/realtime/service/realtime-event-support.service';
import { GameStartFlowService } from './game-start-flow.service';
import { GameRoomsService } from './game-rooms.service';

describe('GameStartFlowService', () => {
  it('broadcasts game-started and game-state-updated with initial editor file metadata', async () => {
    const gameRoomsService: jest.Mocked<Pick<GameRoomsService, 'startGame'>> = {
      startGame: jest.fn().mockResolvedValue({
        gameRoom: {
          id: 'room-1',
          status: GameRoomStatus.IN_PROGRESS,
          difficulty: 'EASY',
          timeLimitSeconds: 30,
          maxStrikeCount: 3,
        },
        gameRoomMission: {
          id: 'mission-1',
          missionTemplateId: 'template-1',
          strikeCount: 0,
          projectStructureJson: {
            rootPath: '/workspace',
            entryFilePath: 'main.py',
            files: [
              {
                filePath: 'main.py',
                language: 'python',
                readonly: false,
                content: 'print("hello")\n',
              },
            ],
          },
        },
        currentTurn: {
          id: 'turn-1',
          playerUserId: 'user-1',
          turnNumber: 1,
          startedAt: new Date('2026-05-26T01:00:00.000Z'),
          deadlineAt: new Date('2026-05-26T01:00:30.000Z'),
          status: TurnStatus.IN_PROGRESS,
        },
        currentStep: {
          id: 'step-1',
          status: GameRoomMissionStepStatus.IN_PROGRESS,
        },
      } as never),
    };
    const realtimeEventSupportService: jest.Mocked<
      Pick<
        RealtimeEventSupportService,
        'publishGameStarted' | 'publishGameStateUpdated'
      >
    > = {
      publishGameStarted: jest.fn().mockResolvedValue(undefined),
      publishGameStateUpdated: jest.fn().mockResolvedValue(undefined),
    };
    const service = new GameStartFlowService(
      gameRoomsService as unknown as GameRoomsService,
      realtimeEventSupportService as unknown as RealtimeEventSupportService,
    );

    const result = await service.startGame({
      actorUserId: 'user-1',
      gameRoomId: 'room-1',
      missionTemplateId: 'template-1',
    });

    expect(gameRoomsService.startGame).toHaveBeenCalledWith({
      actorUserId: 'user-1',
      gameRoomId: 'room-1',
      missionTemplateId: 'template-1',
    });
    expect(realtimeEventSupportService.publishGameStarted).toHaveBeenCalledWith(
      expect.objectContaining({
        gameRoomId: 'room-1',
        gameState: expect.objectContaining({
          status: GameRoomStatus.IN_PROGRESS,
          turnState: expect.objectContaining({
            turnId: 'turn-1',
            currentPlayerId: 'user-1',
          }),
        }),
        missionState: expect.objectContaining({
          missionId: 'mission-1',
          currentStepStatus: GameRoomMissionStepStatus.IN_PROGRESS,
          projectStructure: expect.objectContaining({
            files: [
              expect.objectContaining({
                filePath: 'main.py',
                language: 'python',
                readonly: false,
                fileUrl: expect.stringContaining('data:text/plain'),
              }),
            ],
          }),
        }),
      }),
    );
    expect(realtimeEventSupportService.publishGameStateUpdated).toHaveBeenCalled();
    expect(result.gameRoomMission.id).toBe('mission-1');
  });
});
