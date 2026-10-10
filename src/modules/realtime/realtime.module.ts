import { GameRoomItemsModule } from '../game-room-items/game-room-items.module';
import { forwardRef, Module } from '@nestjs/common';
import { RedisIntegrationModule } from '../../integrations/redis/redis.module';
import { WebsocketIntegrationModule } from '../../integrations/websocket/websocket.module';
import { GameRoomParticipantsModule } from '../game-room-participants/game-room-participants.module';
import { GameRoomsModule } from '../game-rooms/game-rooms.module';
import { TurnsModule } from '../turns/turns.module';
import { RealtimeGateway } from './gateway/realtime.gateway';
import {
  DefaultRealtimeAssistiveMessageService,
  DefaultRealtimeTurnSubmitService,
} from './service/realtime-defaults.service';
import { JwtRealtimeAuthService } from './service/realtime-auth.service';
import { DatabaseRealtimeDisconnectService } from './service/realtime-disconnect.service';
import { DatabaseRealtimeRoomAccessService } from './service/realtime-room-access.service';
import { RealtimeRoomStateService } from './service/realtime-room-state.service';
import { DatabaseRealtimeTurnEditService } from './service/realtime-turn-edit.service';
import { RealtimeTurnTimeoutService } from './service/realtime-turn-timeout.service';
import {
  REALTIME_ASSISTIVE_MESSAGE_SERVICE,
  REALTIME_AUTH_SERVICE,
  REALTIME_DISCONNECT_SERVICE,
  REALTIME_ROOM_ACCESS_SERVICE,
  REALTIME_TURN_EDIT_SERVICE,
  REALTIME_TURN_SUBMIT_SERVICE,
} from './service/realtime.constants';
import { RealtimeEventSupportService } from './service/realtime-event-support.service';
import { TeamChatModule } from '../team-chat/team-chat.module';

/**
 * Responsibilities: establish WebSocket connections, authenticate join-room,
 * relay code changes/submissions/state broadcasts, return latest state on join.
 * Rule: the gateway never decides authoritative state directly.
 */
@Module({
  imports: [
    WebsocketIntegrationModule,
    RedisIntegrationModule,
    TurnsModule,
    GameRoomItemsModule,
    GameRoomParticipantsModule,
    forwardRef(() => GameRoomsModule),
    TeamChatModule,
  ],
  providers: [
    RealtimeGateway,
    RealtimeRoomStateService,
    JwtRealtimeAuthService,
    DatabaseRealtimeRoomAccessService,
    DatabaseRealtimeDisconnectService,
    DatabaseRealtimeTurnEditService,
    DefaultRealtimeTurnSubmitService,
    DefaultRealtimeAssistiveMessageService,
    RealtimeEventSupportService,
    RealtimeTurnTimeoutService,
    {
      provide: REALTIME_AUTH_SERVICE,
      useExisting: JwtRealtimeAuthService,
    },
    {
      provide: REALTIME_ROOM_ACCESS_SERVICE,
      useExisting: DatabaseRealtimeRoomAccessService,
    },
    {
      provide: REALTIME_DISCONNECT_SERVICE,
      useExisting: DatabaseRealtimeDisconnectService,
    },
    {
      provide: REALTIME_TURN_EDIT_SERVICE,
      useExisting: DatabaseRealtimeTurnEditService,
    },
    {
      provide: REALTIME_TURN_SUBMIT_SERVICE,
      useExisting: DefaultRealtimeTurnSubmitService,
    },
    {
      provide: REALTIME_ASSISTIVE_MESSAGE_SERVICE,
      useExisting: DefaultRealtimeAssistiveMessageService,
    },
  ],
  exports: [
    REALTIME_AUTH_SERVICE,
    REALTIME_ROOM_ACCESS_SERVICE,
    REALTIME_DISCONNECT_SERVICE,
    REALTIME_TURN_EDIT_SERVICE,
    REALTIME_TURN_SUBMIT_SERVICE,
    REALTIME_ASSISTIVE_MESSAGE_SERVICE,
    RealtimeEventSupportService,
    RealtimeRoomStateService,
  ],
})
export class RealtimeModule {}
