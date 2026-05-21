import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@database/base.entity';
import { ExecutionStatus } from '@shared/enums';

@Entity({ name: 'executions' })
@Index(['gameRoomId', 'missionId', 'turnId'])
export class ExecutionEntity extends BaseEntity {
  @Column({ name: 'game_room_id', type: 'uuid' })
  gameRoomId!: string;

  @Column({ name: 'mission_id', type: 'uuid' })
  missionId!: string;

  @Column({ name: 'turn_id', type: 'uuid' })
  turnId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'container_id', type: 'text', nullable: true })
  containerId!: string | null;

  @Column({ type: 'text' })
  status!: ExecutionStatus;

  @Column({ type: 'text' })
  command!: string;

  @Column({ name: 'timeout_ms', type: 'integer', nullable: true })
  timeoutMs!: number | null;

  @Column({ type: 'text', nullable: true })
  stdout!: string | null;

  @Column({ type: 'text', nullable: true })
  stderr!: string | null;

  @Column({ name: 'exit_code', type: 'integer', nullable: true })
  exitCode!: number | null;

  @Column({ name: 'runtime_failure_code', type: 'text', nullable: true })
  runtimeFailureCode!: string | null;

  @Column({ name: 'runtime_failure_message', type: 'text', nullable: true })
  runtimeFailureMessage!: string | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt!: Date | null;
}
