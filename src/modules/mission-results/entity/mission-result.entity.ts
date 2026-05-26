import { BaseEntity } from '@database/base.entity';
import { MissionResultJudgeStatus } from '@shared/enums';
import { Column, Entity, Index, Unique } from 'typeorm';

@Entity({ name: 'mission_results' })
@Unique('uq_mission_results_turn_id', ['turnId'])
@Index(['gameRoomId', 'missionId', 'turnId'])
export class MissionResultEntity extends BaseEntity {
  @Column({ name: 'game_room_id', type: 'uuid' })
  gameRoomId!: string;

  @Column({ name: 'mission_id', type: 'uuid' })
  missionId!: string;

  @Column({ name: 'turn_id', type: 'uuid' })
  turnId!: string;

  @Column({ name: 'judge_status', type: 'text' })
  judgeStatus!: MissionResultJudgeStatus;

  @Column({ name: 'result_payload_json', type: 'jsonb' })
  resultPayloadJson!: Record<string, unknown>;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;
}
