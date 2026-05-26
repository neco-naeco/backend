import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUserId } from '@common/decorators/current-user-id.decorator';
import { AuthenticatedRequestGuard } from '@common/guards/authenticated-request.guard';
import { GameRoomMissionsService } from '../service/game-room-missions.service';

interface GameRoomMissionHintResponse {
  missionId: string;
  scope: 'current-step';
  stepId: string;
  stepOrder: number;
  status: string;
  targetFilePath: string;
  hintText: string;
}

@Controller('game-room-missions')
@UseGuards(AuthenticatedRequestGuard)
export class GameRoomMissionsController {
  constructor(
    private readonly gameRoomMissionsService: GameRoomMissionsService,
  ) {}

  @Get(':missionId/hints')
  async getHints(
    @CurrentUserId() userId: string,
    @Param('missionId', new ParseUUIDPipe({ version: '4' })) missionId: string,
    @Query('scope') scope?: string,
  ): Promise<GameRoomMissionHintResponse> {
    if (scope !== 'current-step') {
      throw new BadRequestException({
        code: 'MISSION_HINT_SCOPE_INVALID',
        message: 'Only the current-step hint scope is supported.',
      });
    }

    const hint = await this.gameRoomMissionsService.getCurrentStepHint(
      userId,
      missionId,
    );

    return {
      missionId: hint.missionId,
      scope: 'current-step',
      stepId: hint.stepId,
      stepOrder: hint.stepOrder,
      status: hint.status,
      targetFilePath: hint.targetFilePath,
      hintText: hint.hintText,
    };
  }
}
