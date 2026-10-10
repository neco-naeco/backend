import { Module } from '@nestjs/common';
import { GameRoomItemsService } from './service/game-room-items.service';

@Module({
  providers: [GameRoomItemsService],
  exports: [GameRoomItemsService],
})
export class GameRoomItemsModule {}
