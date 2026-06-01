import { GameRoomsController } from './game-rooms.controller';
import { GameStartFlowService } from '../service/game-start-flow.service';
import { GameRoomsService } from '../service/game-rooms.service';

describe('GameRoomsController', () => {
  let controller: GameRoomsController;
  let gameRoomsService: jest.Mocked<Pick<GameRoomsService, 'listAccessibleRooms'>>;
  let gameStartFlowService: jest.Mocked<Pick<GameStartFlowService, 'startGame'>>;

  beforeEach(() => {
    gameRoomsService = {
      listAccessibleRooms: jest.fn(),
    };
    gameStartFlowService = {
      startGame: jest.fn(),
    };

    controller = new GameRoomsController(
      gameRoomsService as never,
      gameStartFlowService as never,
    );
  });

  it('returns a minimal success payload for game start', async () => {
    gameStartFlowService.startGame.mockResolvedValue({
      gameRoom: {
        id: 'room-1',
        status: 'IN_PROGRESS',
        updatedAt: new Date('2026-06-01T00:00:00.000Z'),
      },
      gameRoomMission: {
        id: 'mission-1',
      },
    } as never);

    await expect(
      controller.startGame(
        'user-1',
        '11111111-1111-4111-8111-111111111111',
        { missionTemplateId: '22222222-2222-4222-8222-222222222222' },
      ),
    ).resolves.toEqual({
      success: true,
    });

    expect(gameStartFlowService.startGame).toHaveBeenCalledWith({
      actorUserId: 'user-1',
      gameRoomId: '11111111-1111-4111-8111-111111111111',
      missionTemplateId: '22222222-2222-4222-8222-222222222222',
    });
  });
});
