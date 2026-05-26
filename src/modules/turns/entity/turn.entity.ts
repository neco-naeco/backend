import { BaseEntity } from '@database/base.entity';
import { TurnStatus } from '@shared/enums';
import { Column, Entity, Index } from 'typeorm';

@Entity({ name: 'turns' })
@Index(['gameRoomId', 'missionId'])
export class TurnEntity extends BaseEntity {
  @Column({ name: 'game_room_id', type: 'uuid' })
  gameRoomId!: string;

  @Column({ name: 'mission_id', type: 'uuid' })
  missionId!: string;

  @Column({ name: 'player_user_id', type: 'uuid' })
  playerUserId!: string;

  @Column({ name: 'turn_number', type: 'integer' })
  turnNumber!: number;

  @Column({ type: 'text' })
  status!: TurnStatus;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt!: Date;

  @Column({ name: 'deadline_at', type: 'timestamptz' })
  deadlineAt!: Date;

  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt!: Date | null;
}
