import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUserId } from '@common/decorators/current-user-id.decorator';
import { AuthenticatedRequestGuard } from '@common/guards/authenticated-request.guard';
import { CreatePracticeRoomDto } from '../dto/create-practice-room.dto';
import { PracticeRoomsService } from '../service/practice-rooms.service';

@Controller('practice-rooms')
@UseGuards(AuthenticatedRequestGuard)
export class PracticeRoomsController {
  constructor(private readonly practiceRoomsService: PracticeRoomsService) {}

  @Post()
  async createPracticeRoom(
    @CurrentUserId() userId: string,
    @Body() body: CreatePracticeRoomDto,
  ): Promise<{ success: boolean }> {
    await this.practiceRoomsService.createAndStart({
      ownerUserId: userId,
      difficulty: body.difficulty,
      missionTemplateId: body.missionTemplateId,
    });

    return { success: true };
  }
}
