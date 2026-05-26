import { BaseEntity } from '@database/base.entity';
import { GameRoomMissionStepStatus } from '@shared/enums';
import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { GameRoomMissionEntity } from './game-room-mission.entity';
import { MissionTemplateStepEntity } from './mission-template-step.entity';

@Entity('game_room_mission_steps')
@Unique('uq_game_room_mission_steps_mission_id_step_order', [
  'gameRoomMissionId',
  'stepOrder',
])
@Index('idx_game_room_mission_steps_mission_id_step_order', [
  'gameRoomMissionId',
  'stepOrder',
])
export class GameRoomMissionStepEntity extends BaseEntity {
  @Column({ type: 'uuid', name: 'game_room_mission_id' })
  gameRoomMissionId!: string;

  @Column({ type: 'uuid', name: 'mission_template_step_id' })
  missionTemplateStepId!: string;

  @Column({ type: 'integer', name: 'step_order' })
  stepOrder!: number;

  @Column({ type: 'text' })
  status!: GameRoomMissionStepStatus;

  @ManyToOne(
    () => GameRoomMissionEntity,
    (gameRoomMission) => gameRoomMission.steps,
    { onDelete: 'CASCADE' },
  )
  @JoinColumn({ name: 'game_room_mission_id' })
  gameRoomMission!: GameRoomMissionEntity;

  @ManyToOne(() => MissionTemplateStepEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'mission_template_step_id' })
  missionTemplateStep!: MissionTemplateStepEntity;
}
