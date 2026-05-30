import { Module } from '@nestjs/common';
import { AuthenticatedRequestGuard } from '@common/guards/authenticated-request.guard';
import { RuntimeIntegrationModule } from '@integrations/runtime/runtime.module';
import { GameRoomMissionsController } from './controller/game-room-missions.controller';
import { GameRoomMissionsService } from './service/game-room-missions.service';
import { MissionSeedService } from './service/mission-seed.service';

/**
 * Responsibilities: create mission instances on game start, track current step,
 * return hints, finish missions.
 * To be implemented by Worker 2.
 */
@Module({
  imports: [RuntimeIntegrationModule],
  controllers: [GameRoomMissionsController],
  providers: [AuthenticatedRequestGuard, GameRoomMissionsService, MissionSeedService],
  exports: [GameRoomMissionsService],
})
export class GameRoomMissionsModule {}
