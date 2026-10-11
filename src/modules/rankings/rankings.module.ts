import { Module } from '@nestjs/common';
import { AuthenticatedRequestGuard } from '@common/guards/authenticated-request.guard';
import { RankingsController } from './rankings.controller';
import { RankingsService } from './rankings.service';

@Module({
  controllers: [RankingsController],
  providers: [AuthenticatedRequestGuard, RankingsService],
})
export class RankingsModule {}
