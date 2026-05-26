import { BaseEntity } from '@database/base.entity';
import { GameRoomEntity } from '@modules/game-rooms/entity/game-room.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, Unique } from 'typeorm';
import { GameRoomMissionStepEntity } from './game-room-mission-step.entity';
import { MissionTemplateEntity } from './mission-template.entity';

@Entity('game_room_missions')
@Unique('uq_game_room_missions_game_room_id', ['gameRoomId'])
@Index('idx_game_room_missions_game_room_id', ['gameRoomId'])
export class GameRoomMissionEntity extends BaseEntity {
  @Column({ type: 'uuid', name: 'game_room_id' })
  gameRoomId!: string;

  @Column({ type: 'uuid', name: 'mission_template_id' })
  missionTemplateId!: string;

  @Column({ type: 'uuid', name: 'current_step_id', nullable: true })
  currentStepId!: string | null;

  @Column({ type: 'text', name: 'container_id', nullable: true })
  containerId!: string | null;

  @Column({ type: 'integer', name: 'strike_count' })
  strikeCount!: number;

  @Column({ type: 'jsonb', name: 'judge_policy_json' })
  judgePolicyJson!: Record<string, unknown>;

  @Column({ type: 'jsonb', name: 'project_structure_json' })
  projectStructureJson!: Record<string, unknown>;

  @Column({ type: 'timestamptz', name: 'started_at', nullable: true })
  startedAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'finished_at', nullable: true })
  finishedAt!: Date | null;

  @ManyToOne(() => GameRoomEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'game_room_id' })
  gameRoom!: GameRoomEntity;

  @ManyToOne(() => MissionTemplateEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'mission_template_id' })
  missionTemplate!: MissionTemplateEntity;

  @OneToMany(
    () => GameRoomMissionStepEntity,
    (gameRoomMissionStep) => gameRoomMissionStep.gameRoomMission,
  )
  steps!: GameRoomMissionStepEntity[];
}
