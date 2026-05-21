import { Module } from '@nestjs/common';
import { InMemoryRealtimeSupportStateStore } from './realtime-support-state.store';
import { REALTIME_SUPPORT_STATE_STORE } from '../../modules/realtime/service/realtime.constants';

/**
 * Redis integration adapter.
 * Covers: session connectivity state, current turn cache, broadcast fan-out support.
 * Worker 3 (realtime/runtime) will implement the provider.
 */
@Module({
  providers: [
    InMemoryRealtimeSupportStateStore,
    {
      provide: REALTIME_SUPPORT_STATE_STORE,
      useExisting: InMemoryRealtimeSupportStateStore,
    },
  ],
  exports: [REALTIME_SUPPORT_STATE_STORE],
})
export class RedisIntegrationModule {}
