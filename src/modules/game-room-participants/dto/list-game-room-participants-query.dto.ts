import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { GameRoomParticipantMembershipStatus } from '@shared/enums';

export class ListGameRoomParticipantsQueryDto {
  @IsOptional()
  @IsUUID()
  gameRoomId?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsEnum(GameRoomParticipantMembershipStatus)
  membershipStatus?: GameRoomParticipantMembershipStatus;
}
