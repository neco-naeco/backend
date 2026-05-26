import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DataSource, LessThanOrEqual, Repository } from 'typeorm';
import { TurnStatus } from '@shared/enums';
import { TurnEntity } from '@modules/turns/entity/turn.entity';
import { TurnsService } from '@modules/turns/service/turns.service';
import { REALTIME_SUPPORT_STATE_STORE } from './realtime.constants';
import { RealtimeSupportStateStore } from './realtime.interfaces';
import { RealtimeEventSupportService } from './realtime-event-support.service';

@Injectable()
export class RealtimeTurnTimeoutService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RealtimeTurnTimeoutService.name);
  private readonly processingTurnIds = new Set<string>();
  private intervalId: NodeJS.Timeout | null = null;

  constructor(
    private readonly dataSource: DataSource,
    private readonly turnsService: TurnsService,
    private readonly realtimeEventSupportService: RealtimeEventSupportService,
    @Inject(REALTIME_SUPPORT_STATE_STORE)
    private readonly supportStateStore: RealtimeSupportStateStore,
  ) {}

  onModuleInit(): void {
    this.intervalId = setInterval(() => {
      void this.processExpiredTurns();
    }, 1000);
  }

  onModuleDestroy(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async processExpiredTurns(now: Date = new Date()): Promise<void> {
    const expiredTurns = await this.getTurnRepository().find({
      where: {
        status: TurnStatus.IN_PROGRESS,
        deadlineAt: LessThanOrEqual(now),
      },
      order: {
        deadlineAt: 'ASC',
      },
    });

    for (const turn of expiredTurns) {
      if (this.processingTurnIds.has(turn.id)) {
        continue;
      }

      this.processingTurnIds.add(turn.id);

      try {
        const files = await this.supportStateStore.listLatestFileContents({
          gameRoomId: turn.gameRoomId,
          turnId: turn.id,
        });
        const result = await this.turnsService.timeoutTurn({
          gameRoomId: turn.gameRoomId,
          turnId: turn.id,
          userId: turn.playerUserId,
          occurredAt: now.toISOString(),
          files,
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
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'unknown timeout sweep error';
        this.logger.warn(`Failed to process expired turn ${turn.id}: ${message}`);
      } finally {
        this.processingTurnIds.delete(turn.id);
      }
    }
  }

  private getTurnRepository(): Repository<TurnEntity> {
    return this.dataSource.getRepository(TurnEntity);
  }
}
