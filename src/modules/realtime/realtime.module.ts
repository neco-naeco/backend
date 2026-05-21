import { Module } from '@nestjs/common';
import { RedisIntegrationModule } from '../../integrations/redis/redis.module';
import { WebsocketIntegrationModule } from '../../integrations/websocket/websocket.module';
import { RealtimeGateway } from './gateway/realtime.gateway';
import {
  DefaultRealtimeAuthService,
  DefaultRealtimeDisconnectService,
  DefaultRealtimeRoomAccessService,
  DefaultRealtimeTurnEditService,
} from './service/realtime-defaults.service';
import {
  REALTIME_AUTH_SERVICE,
  REALTIME_DISCONNECT_SERVICE,
  REALTIME_ROOM_ACCESS_SERVICE,
  REALTIME_TURN_EDIT_SERVICE,
} from './service/realtime.constants';

/**
 * Responsibilities: establish WebSocket connections, authenticate join-room,
 * relay code changes/submissions/state broadcasts, return latest state on join.
 * Rule: the gateway never decides authoritative state directly.
 * To be implemented by Worker 3.
 */
@Module({
  imports: [WebsocketIntegrationModule, RedisIntegrationModule],
  providers: [
    RealtimeGateway,
    DefaultRealtimeAuthService,
    DefaultRealtimeRoomAccessService,
    DefaultRealtimeDisconnectService,
    DefaultRealtimeTurnEditService,
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
  ],
  exports: [
    REALTIME_AUTH_SERVICE,
    REALTIME_ROOM_ACCESS_SERVICE,
    REALTIME_DISCONNECT_SERVICE,
    REALTIME_TURN_EDIT_SERVICE,
  ],
})
export class RealtimeModule {}
