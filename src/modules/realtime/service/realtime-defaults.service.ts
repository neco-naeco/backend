import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { TurnsService } from '@modules/turns/service/turns.service';
import {
  RealtimeAssistiveMessageRequest,
  RealtimeAssistiveMessageService,
  RealtimeAuthenticatedUser,
  RealtimeAuthService,
  RealtimeDisconnectService,
  RealtimeJoinRoomState,
  RealtimeRoomAccessService,
  RealtimeTurnSubmitRequest,
  RealtimeTurnSubmitService,
  RealtimeTurnEditAuthorization,
  RealtimeTurnEditService,
} from './realtime.interfaces';
import { RealtimeEventSupportService } from './realtime-event-support.service';

@Injectable()
export class DefaultRealtimeAuthService implements RealtimeAuthService {
  async validateAccessToken(_accessToken: string): Promise<RealtimeAuthenticatedUser> {
    throw new InternalServerErrorException('Realtime auth service is not configured');
  }
}

@Injectable()
export class DefaultRealtimeRoomAccessService implements RealtimeRoomAccessService {
  async getJoinRoomState(_input: {
    gameRoomId: string;
    userId: string;
  }): Promise<RealtimeJoinRoomState> {
    throw new InternalServerErrorException('Realtime room access service is not configured');
  }
}

@Injectable()
export class DefaultRealtimeDisconnectService implements RealtimeDisconnectService {
  async handleDisconnect(_input: { gameRoomId: string; userId: string }): Promise<void> {}
}

@Injectable()
export class DefaultRealtimeTurnEditService implements RealtimeTurnEditService {
  async authorizeCodeChange(_input: {
    gameRoomId: string;
    userId: string;
  }): Promise<RealtimeTurnEditAuthorization> {
    return {
      isEditable: false,
      currentTurnId: null,
      currentTurnUserId: null,
    };
  }
}

@Injectable()
export class DefaultRealtimeTurnSubmitService implements RealtimeTurnSubmitService {
  constructor(
    private readonly turnsService: TurnsService,
    private readonly realtimeEventSupportService: RealtimeEventSupportService,
  ) {}

  async submitTurn(input: RealtimeTurnSubmitRequest): Promise<void> {
    const result = await this.turnsService.submitTurn({
      gameRoomId: input.gameRoomId,
      turnId: input.turnId,
      userId: input.userId,
      occurredAt: input.occurredAt,
      files: input.files,
    });

    this.realtimeEventSupportService.publishTurnSubmit(result.submitEvent);
    await this.realtimeEventSupportService.publishTurnEvaluated(
      result.evaluatedEvent,
    );

    if (result.turnChangedEvent) {
      await this.realtimeEventSupportService.publishTurnChanged(
        result.turnChangedEvent,
      );
    }

    if (result.missionResultEvent) {
      await this.realtimeEventSupportService.publishMissionResult(
        result.missionResultEvent,
      );
    }

    await this.realtimeEventSupportService.publishGameStateUpdated(
      result.gameStateUpdatedEvent,
    );
  }
}

@Injectable()
export class DefaultRealtimeAssistiveMessageService
  implements RealtimeAssistiveMessageService
{
  async buildNotice(_input: RealtimeAssistiveMessageRequest) {
    return null;
  }
}
