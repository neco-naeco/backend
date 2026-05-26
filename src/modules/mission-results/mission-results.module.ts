import { Module } from '@nestjs/common';
import { MissionResultsService } from './service/mission-results.service';

/**
 * Responsibilities: persist turn-level and mission-level judgment results,
 * apply strike counts and step success/failure.
 * To be implemented by Worker 2 / shared track (C4).
 */
@Module({
  providers: [MissionResultsService],
  exports: [MissionResultsService],
})
export class MissionResultsModule {}
