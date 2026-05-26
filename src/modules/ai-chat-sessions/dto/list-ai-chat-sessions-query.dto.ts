import { IsOptional, IsUUID } from 'class-validator';

export class ListAiChatSessionsQueryDto {
  @IsOptional()
  @IsUUID()
  gameRoomId?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;
}
