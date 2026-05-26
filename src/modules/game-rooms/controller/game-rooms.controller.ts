import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsUUID } from 'class-validator';
import { CurrentUserId } from '@common/decorators/current-user-id.decorator';
import { AuthenticatedRequestGuard } from '@common/guards/authenticated-request.guard';
import { toSeoulIso } from '@common/utils/date.util';
import { GameStartFlowService } from '../service/game-start-flow.service';
import { GameRoomsService } from '../service/game-rooms.service';

interface GameRoomListItemResponse {
  id: string;
  ownerUserId: string;
  status: string;
  difficulty: string;
  timeLimitSeconds: number;
  maxStrikeCount: number;
  minParticipants: number;
  maxParticipants: number;
  createdAt: string;
  updatedAt: string;
}

class StartGameRequestBody {
  @IsUUID()
  missionTemplateId!: string;
}

interface GameRoomStartResponse {
  gameRoomId: string;
  gameRoomMissionId: string;
  status: string;
  updatedAt: string;
}

@Controller('game-rooms')
@UseGuards(AuthenticatedRequestGuard)
export class GameRoomsController {
  constructor(
    private readonly gameRoomsService: GameRoomsService,
    private readonly gameStartFlowService: GameStartFlowService,
  ) {}

  @Get()
  async listAccessibleRooms(
    @CurrentUserId() userId: string,
  ): Promise<GameRoomListItemResponse[]> {
    const rooms = await this.gameRoomsService.listAccessibleRooms(userId);

    return rooms.map((room) => ({
      id: room.id,
      ownerUserId: room.ownerUserId,
      status: room.status,
      difficulty: room.difficulty,
      timeLimitSeconds: room.timeLimitSeconds,
      maxStrikeCount: room.maxStrikeCount,
      minParticipants: room.minParticipants,
      maxParticipants: room.maxParticipants,
      createdAt: toSeoulIso(room.createdAt),
      updatedAt: toSeoulIso(room.updatedAt),
    }));
  }

  @Post(':gameRoomId/start')
  async startGame(
    @CurrentUserId() userId: string,
    @Param('gameRoomId', new ParseUUIDPipe({ version: '4' })) gameRoomId: string,
    @Body() body: StartGameRequestBody,
  ): Promise<GameRoomStartResponse> {
    const result = await this.gameStartFlowService.startGame({
      actorUserId: userId,
      gameRoomId,
      missionTemplateId: body.missionTemplateId,
    });

    return {
      gameRoomId: result.gameRoom.id,
      gameRoomMissionId: result.gameRoomMission.id,
      status: result.gameRoom.status,
      updatedAt: toSeoulIso(result.gameRoom.updatedAt),
    };
  }
}
