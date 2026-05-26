import { Module } from '@nestjs/common';
import { AuthenticatedRequestGuard } from '@common/guards/authenticated-request.guard';
import { GameRoomParticipantsController } from './controller/game-room-participants.controller';
import { GameRoomParticipantsService } from './service/game-room-participants.service';

/**
 * Responsibilities: list participants, create/accept/deny invitations, process leave.
 * To be implemented by Worker 2.
 */
@Module({
  controllers: [GameRoomParticipantsController],
  providers: [AuthenticatedRequestGuard, GameRoomParticipantsService],
  exports: [GameRoomParticipantsService],
})
export class GameRoomParticipantsModule {}
