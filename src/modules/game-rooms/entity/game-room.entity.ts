import { BaseEntity } from '@database/base.entity';
import { GameRoomMissionEntity } from '@modules/game-room-missions/entity/game-room-mission.entity';
import { GameRoomParticipantEntity } from '@modules/game-room-participants/entity/game-room-participant.entity';
import { GameRoomStatus } from '@shared/enums';
import { Column, Entity, Index, OneToMany } from 'typeorm';

@Entity('game_rooms')
@Index('idx_game_rooms_owner_user_id_status', ['ownerUserId', 'status'])
export class GameRoomEntity extends BaseEntity {
  @Column({ type: 'uuid', name: 'owner_user_id' })
  ownerUserId!: string;

  @Column({ type: 'text' })
  status!: GameRoomStatus;

  @Column({ type: 'text' })
  difficulty!: string;

  @Column({ type: 'integer', name: 'time_limit_seconds' })
  timeLimitSeconds!: number;

  @Column({ type: 'integer', name: 'max_strike_count' })
  maxStrikeCount!: number;

  @Column({ type: 'integer', name: 'min_participants' })
  minParticipants!: number;

  @Column({ type: 'integer', name: 'max_participants' })
  maxParticipants!: number;

  @OneToMany(() => GameRoomParticipantEntity, (participant) => participant.gameRoom)
  participants!: GameRoomParticipantEntity[];

  @OneToMany(() => GameRoomMissionEntity, (gameRoomMission) => gameRoomMission.gameRoom)
  missions!: GameRoomMissionEntity[];
}
