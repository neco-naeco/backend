import {
  GameRoomParticipantMembershipStatus,
  GameRoomParticipantRole,
  GameRoomStatus,
} from '@shared/enums';

export interface GameRoomParticipantListItemDto {
  id: string;
  gameRoomId: string;
  gameRoomTitle: string;
  userId: string;
  nickname: string;
  role: GameRoomParticipantRole;
  membershipStatus: GameRoomParticipantMembershipStatus;
  status: GameRoomParticipantMembershipStatus;
  roomStatus: GameRoomStatus;
  createdAt: string;
  updatedAt: string;
}
