import { Module } from '@nestjs/common';
import { AuthenticatedRequestGuard } from '@common/guards/authenticated-request.guard';
import { GameRoomMissionsController } from './controller/game-room-missions.controller';
import { GameRoomMissionsService } from './service/game-room-missions.service';

/**
 * Responsibilities: create mission instances on game start, track current step,
 * return hints, finish missions.
 * To be implemented by Worker 2.
 */
@Module({
  controllers: [GameRoomMissionsController],
  providers: [AuthenticatedRequestGuard, GameRoomMissionsService],
  exports: [GameRoomMissionsService],
})
export class GameRoomMissionsModule {}
