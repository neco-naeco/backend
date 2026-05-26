import { BaseEntity } from '@database/base.entity';
import { Column, Entity, Index, Unique } from 'typeorm';

@Entity({ name: 'turn_snapshots' })
@Unique('uq_turn_snapshots_turn_id', ['turnId'])
@Index(['gameRoomId', 'turnId'])
export class TurnSnapshotEntity extends BaseEntity {
  @Column({ name: 'game_room_id', type: 'uuid' })
  gameRoomId!: string;

  @Column({ name: 'turn_id', type: 'uuid' })
  turnId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'code_snapshot_json', type: 'jsonb' })
  codeSnapshotJson!: {
    files: Array<{
      filePath: string;
      content: string;
      occurredAt?: string;
    }>;
  };
}
