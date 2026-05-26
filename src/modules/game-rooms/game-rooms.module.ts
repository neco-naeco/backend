import { Module } from '@nestjs/common';
import { AuthenticatedRequestGuard } from '@common/guards/authenticated-request.guard';
import { GameRoomMissionsModule } from '@modules/game-room-missions/game-room-missions.module';
import { RealtimeModule } from '@modules/realtime/realtime.module';
import { TurnsModule } from '@modules/turns/turns.module';
import { GameRoomsController } from './controller/game-rooms.controller';
import { GameStartFlowService } from './service/game-start-flow.service';
import { GameRoomsService } from './service/game-rooms.service';

/**
 * Responsibilities: list accessible rooms, create rooms, return room state, start games.
 * Dependencies: game-room-missions (setup), integrations/runtime (docker preparation).
 * To be implemented by Worker 2.
 */
@Module({
  imports: [GameRoomMissionsModule, TurnsModule, RealtimeModule],
  controllers: [GameRoomsController],
  providers: [AuthenticatedRequestGuard, GameRoomsService, GameStartFlowService],
  exports: [GameRoomsService, GameStartFlowService],
})
export class GameRoomsModule {}
