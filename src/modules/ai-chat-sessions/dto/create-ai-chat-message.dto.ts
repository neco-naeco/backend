import { IsNotEmpty, IsString } from 'class-validator';

export class CreateAiChatMessageDto {
  @IsString()
  @IsNotEmpty()
  message!: string;
}
