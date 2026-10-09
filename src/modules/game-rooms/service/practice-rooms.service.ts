import { Injectable } from '@nestjs/common';
import { GameRoomMissionsService } from '@modules/game-room-missions/service/game-room-missions.service';
import { GameMode } from '@shared/enums';
import { GameStartFlowService } from './game-start-flow.service';
import { GameRoomsService } from './game-rooms.service';

const PRACTICE_ROOM_SETTINGS = {
  timeLimitSeconds: 30,
  maxStrikeCount: 3,
  minParticipants: 1,
  maxParticipants: 1,
} as const;

@Injectable()
export class PracticeRoomsService {
  constructor(
    private readonly gameRoomMissionsService: GameRoomMissionsService,
    private readonly gameRoomsService: GameRoomsService,
    private readonly gameStartFlowService: GameStartFlowService,
  ) {}

  async createAndStart(input: {
    ownerUserId: string;
    difficulty: 'EASY' | 'NORMAL' | 'HARD';
    missionTemplateId: string;
  }): Promise<void> {
    await this.gameRoomMissionsService.validateMissionTemplateSelection(
      input.difficulty,
      input.missionTemplateId,
    );

    const gameRoom = await this.gameRoomsService.createRoom({
      ownerUserId: input.ownerUserId,
      mode: GameMode.PRACTICE,
      difficulty: input.difficulty,
      ...PRACTICE_ROOM_SETTINGS,
    });

    try {
      await this.gameStartFlowService.startGame({
        actorUserId: input.ownerUserId,
        gameRoomId: gameRoom.id,
        missionTemplateId: input.missionTemplateId,
      });
    } catch (error) {
      await this.gameRoomsService.discardFailedPracticeRoomStart({
        gameRoomId: gameRoom.id,
        ownerUserId: input.ownerUserId,
      });
      throw error;
    }
  }
}
