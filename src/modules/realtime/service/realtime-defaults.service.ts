import { Injectable, InternalServerErrorException } from '@nestjs/common';
import {
  RealtimeAssistiveMessageRequest,
  RealtimeAssistiveMessageService,
  RealtimeAuthenticatedUser,
  RealtimeAuthService,
  RealtimeDisconnectService,
  RealtimeJoinRoomState,
  RealtimeRoomAccessService,
  RealtimeTurnSubmitRequest,
  TurnSubmitEvent,
  RealtimeTurnSubmitService,
  RealtimeTurnEditAuthorization,
  RealtimeTurnEditService,
} from './realtime.interfaces';

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
  async submitTurn(
    _input: RealtimeTurnSubmitRequest,
  ): Promise<TurnSubmitEvent | null> {
    throw new InternalServerErrorException('Realtime turn submit service is not configured');
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
