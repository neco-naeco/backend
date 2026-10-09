import { IsIn, IsUUID } from 'class-validator';

export class CreatePracticeRoomDto {
  @IsIn(['EASY', 'NORMAL', 'HARD'])
  difficulty!: 'EASY' | 'NORMAL' | 'HARD';

  @IsUUID()
  missionTemplateId!: string;
}
