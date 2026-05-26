import { Module } from '@nestjs/common';
import { RedisIntegrationModule } from '../../integrations/redis/redis.module';
import { WebsocketIntegrationModule } from '../../integrations/websocket/websocket.module';
import { TurnsModule } from '../turns/turns.module';
import { RealtimeGateway } from './gateway/realtime.gateway';
import {
  DefaultRealtimeAuthService,
  DefaultRealtimeAssistiveMessageService,
  DefaultRealtimeDisconnectService,
  DefaultRealtimeRoomAccessService,
  DefaultRealtimeTurnSubmitService,
  DefaultRealtimeTurnEditService,
} from './service/realtime-defaults.service';
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

/**
 * Responsibilities: establish WebSocket connections, authenticate join-room,
 * relay code changes/submissions/state broadcasts, return latest state on join.
 * Rule: the gateway never decides authoritative state directly.
 * To be implemented by Worker 3.
 */
@Module({
  imports: [WebsocketIntegrationModule, RedisIntegrationModule, TurnsModule],
  providers: [
    RealtimeGateway,
    DefaultRealtimeAuthService,
    DefaultRealtimeRoomAccessService,
    DefaultRealtimeDisconnectService,
    DefaultRealtimeTurnEditService,
    DefaultRealtimeTurnSubmitService,
    DefaultRealtimeAssistiveMessageService,
    RealtimeEventSupportService,
    RealtimeTurnTimeoutService,
    {
      provide: REALTIME_AUTH_SERVICE,
      useExisting: DefaultRealtimeAuthService,
    },
    {
      provide: REALTIME_ROOM_ACCESS_SERVICE,
      useExisting: DefaultRealtimeRoomAccessService,
    },
    {
      provide: REALTIME_DISCONNECT_SERVICE,
      useExisting: DefaultRealtimeDisconnectService,
    },
    {
      provide: REALTIME_TURN_EDIT_SERVICE,
      useExisting: DefaultRealtimeTurnEditService,
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
  ],
})
export class RealtimeModule {}
