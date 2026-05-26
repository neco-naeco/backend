import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUserId } from '@common/decorators/current-user-id.decorator';
import { AuthenticatedRequestGuard } from '@common/guards/authenticated-request.guard';
import { toSeoulIso } from '@common/utils/date.util';
import { GameRoomParticipantsService } from '../service/game-room-participants.service';

interface GameRoomParticipantListItemResponse {
  id: string;
  gameRoomId: string;
  userId: string;
  role: string;
  membershipStatus: string;
  createdAt: string;
  updatedAt: string;
}

@Controller('game-room-participants')
@UseGuards(AuthenticatedRequestGuard)
export class GameRoomParticipantsController {
  constructor(
    private readonly gameRoomParticipantsService: GameRoomParticipantsService,
  ) {}

  @Get()
  async listParticipants(
    @CurrentUserId() userId: string,
  ): Promise<GameRoomParticipantListItemResponse[]> {
    const participants =
      await this.gameRoomParticipantsService.listParticipantsForUser(userId);

    return participants.map((participant) => ({
      id: participant.id,
      gameRoomId: participant.gameRoomId,
      userId: participant.userId,
      role: participant.role,
      membershipStatus: participant.membershipStatus,
      createdAt: toSeoulIso(participant.createdAt),
      updatedAt: toSeoulIso(participant.updatedAt),
    }));
  }
}
