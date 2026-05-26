import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { MissionResultJudgeStatus } from '@shared/enums';
import { MissionResultEntity } from '../entity/mission-result.entity';

export interface CreateMissionResultInput {
  manager?: EntityManager;
  gameRoomId: string;
  missionId: string;
  turnId: string;
  judgeStatus: MissionResultJudgeStatus;
  resultPayloadJson: Record<string, unknown>;
  occurredAt: Date;
}

@Injectable()
export class MissionResultsService {
  constructor(private readonly dataSource: DataSource) {}

  async createMissionResult(
    input: CreateMissionResultInput,
  ): Promise<MissionResultEntity> {
    const repository = this.getRepository(input.manager);
    const missionResult = repository.create({
      gameRoomId: input.gameRoomId,
      missionId: input.missionId,
      turnId: input.turnId,
      judgeStatus: input.judgeStatus,
      resultPayloadJson: input.resultPayloadJson,
      occurredAt: input.occurredAt,
    });

    return repository.save(missionResult);
  }

  private getRepository(
    manager?: EntityManager,
  ): Repository<MissionResultEntity> {
    if (manager) {
      return manager.getRepository(MissionResultEntity);
    }

    return this.dataSource.getRepository(MissionResultEntity);
  }
}
