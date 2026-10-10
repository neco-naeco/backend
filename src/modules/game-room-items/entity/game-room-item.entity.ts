import { BaseEntity } from '@database/base.entity';
import { GameRoomEntity } from '@modules/game-rooms/entity/game-room.entity';
import { GameItemType } from '@shared/enums';
import { Check, Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';

@Entity('game_room_items')
@Unique('uq_game_room_items_room_type', ['gameRoomId', 'itemType'])
@Check('chk_game_room_items_quantity_nonnegative', '"quantity" >= 0')
@Check('chk_game_room_items_used_count_nonnegative', '"used_count" >= 0')
export class GameRoomItemEntity extends BaseEntity {
  @Column({ name: 'game_room_id', type: 'uuid' })
  gameRoomId!: string;

  @Column({ name: 'item_type', type: 'text' })
  itemType!: GameItemType;

  @Column({ type: 'integer', default: 1 })
  quantity!: number;

  @Column({ name: 'used_count', type: 'integer', default: 0 })
  usedCount!: number;

  @ManyToOne(() => GameRoomEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'game_room_id', foreignKeyConstraintName: 'fk_game_room_items_room' })
  gameRoom!: GameRoomEntity;
}
