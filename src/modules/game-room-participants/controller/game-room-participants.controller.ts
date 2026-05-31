import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUserId } from '@common/decorators/current-user-id.decorator';
import { AuthenticatedRequestGuard } from '@common/guards/authenticated-request.guard';
import { GameRoomParticipantsService } from '../service/game-room-participants.service';
import { GameRoomParticipantListItemDto } from '../dto/game-room-participant-list-item.dto';
import { ListGameRoomParticipantsQueryDto } from '../dto/list-game-room-participants-query.dto';

@Controller('game-room-participants')
@UseGuards(AuthenticatedRequestGuard)
export class GameRoomParticipantsController {
  constructor(
    private readonly gameRoomParticipantsService: GameRoomParticipantsService,
  ) {}

  @Get()
  async listParticipants(
    @CurrentUserId() userId: string,
    @Query() query: ListGameRoomParticipantsQueryDto,
  ): Promise<GameRoomParticipantListItemDto[]> {
    return this.gameRoomParticipantsService.listParticipantsForUser({
      authenticatedUserId: userId,
      query,
    });
  }
}
