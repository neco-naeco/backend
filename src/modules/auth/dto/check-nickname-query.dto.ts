import { IsNotEmpty, IsString } from 'class-validator';

export class CheckNicknameQueryDto {
  @IsString()
  @IsNotEmpty()
  nickname!: string;
}
