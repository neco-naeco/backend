import { AiChatRequestType } from '../../../shared/enums/ai-chat.enum';
import { AiChatCommandResultStatus } from '../../../shared/dto/ai-chat-command.dto';
import { AiChatCommandResultMapper } from './ai-chat-command-result.mapper';

describe('AiChatCommandResultMapper', () => {
  const mapper = new AiChatCommandResultMapper();

  it('maps ROOM_CREATE to PENDING game-rooms path', () => {
    expect(
      mapper.toPendingResult({
        requestType: AiChatRequestType.ROOM_CREATE,
        desiredDifficulty: 'EASY',
      }),
    ).toEqual({
      commandType: AiChatRequestType.ROOM_CREATE,
      status: AiChatCommandResultStatus.PENDING,
      apiPath: '/v1/game-rooms',
      gameRoomId: null,
      title: null,
      participants: null,
      started: null,
    });
  });

  it('maps USER_INVITE with gameRoomId to invite path', () => {
    expect(
      mapper.toPendingResult({
        requestType: AiChatRequestType.USER_INVITE,
        gameRoomId: 'room-1',
        inviteeNicknames: ['a'],
      }),
    ).toMatchObject({
      apiPath: '/v1/game-rooms/room-1/invite',
      gameRoomId: 'room-1',
    });
  });

  it('maps GAME_START with started false while pending', () => {
    expect(
      mapper.toPendingResult({
        requestType: AiChatRequestType.GAME_START,
        gameRoomId: 'room-2',
      }),
    ).toMatchObject({
      status: AiChatCommandResultStatus.PENDING,
      started: false,
      apiPath: '/v1/game-rooms/room-2/start',
    });
  });
});
