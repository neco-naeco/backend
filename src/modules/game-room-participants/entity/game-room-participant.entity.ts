import { BaseEntity } from '@database/base.entity';
import { GameRoomEntity } from '@modules/game-rooms/entity/game-room.entity';
import {
  GameRoomParticipantMembershipStatus,
  GameRoomParticipantRole,
} from '@shared/enums';
import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';

@Entity('game_room_participants')
@Unique('uq_game_room_participants_game_room_id_user_id', ['gameRoomId', 'userId'])
@Index('idx_game_room_participants_user_id_membership_status', ['userId', 'membershipStatus'])
export class GameRoomParticipantEntity extends BaseEntity {
  @Column({ type: 'uuid', name: 'game_room_id' })
  gameRoomId!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({ type: 'text' })
  role!: GameRoomParticipantRole;

  @Column({ type: 'text', name: 'membership_status' })
  membershipStatus!: GameRoomParticipantMembershipStatus;

  @ManyToOne(() => GameRoomEntity, (gameRoom) => gameRoom.participants, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'game_room_id' })
  gameRoom!: GameRoomEntity;
}
