import { Module } from '@nestjs/common';
import { AuthenticatedRequestGuard } from '@common/guards/authenticated-request.guard';
import { GameRoomMissionsModule } from '@modules/game-room-missions/game-room-missions.module';
import { GameRoomsController } from './controller/game-rooms.controller';
import { GameRoomsService } from './service/game-rooms.service';

/**
 * Responsibilities: list accessible rooms, create rooms, return room state, start games.
 * Dependencies: game-room-missions (setup), integrations/runtime (docker preparation).
 * To be implemented by Worker 2.
 */
@Module({
  imports: [GameRoomMissionsModule],
  controllers: [GameRoomsController],
  providers: [AuthenticatedRequestGuard, GameRoomsService],
  exports: [GameRoomsService],
})
export class GameRoomsModule {}
