import { Injectable } from '@nestjs/common';
import { toSeoulIso } from '@common/utils/date.util';
import { GameRoomMissionStepEntity } from '@modules/game-room-missions/entity/game-room-mission-step.entity';
import { RealtimeEventSupportService } from '@modules/realtime/service/realtime-event-support.service';
import type {
  RealtimeMissionStepSummary,
  RealtimeProjectStructure,
} from '@modules/realtime/service/realtime.interfaces';
import { GameRoomsService, StartGameInput, StartGameResult } from './game-rooms.service';

@Injectable()
export class GameStartFlowService {
  constructor(
    private readonly gameRoomsService: GameRoomsService,
    private readonly realtimeEventSupportService: RealtimeEventSupportService,
  ) {}

  async startGame(input: StartGameInput): Promise<StartGameResult> {
    const result = await this.gameRoomsService.startGame(input);
    const occurredAt = toSeoulIso(result.currentTurn.startedAt);
    const missionState = {
      missionId: result.gameRoomMission.id,
      missionTemplateId: result.gameRoomMission.missionTemplateId,
      currentStepId: result.currentStep.id,
      currentStepStatus: result.currentStep.status,
      gameRoomMissionStepId: result.currentStep.id,
      missionTemplateStepId: result.currentStep.missionTemplateStepId,
      stepOrder: result.currentStep.stepOrder,
      stepTitle: result.currentStep.missionTemplateStep?.title ?? '',
      stepDescription: result.currentStep.missionTemplateStep?.description ?? '',
      steps: buildMissionSteps(result.gameRoomMission.steps),
      title: result.gameRoomMission.missionTemplate?.title ?? '',
      description: result.gameRoomMission.missionTemplate?.description ?? '',
      language: result.gameRoomMission.missionTemplate?.language ?? '',
      difficulty: result.gameRoom.difficulty,
      strikeCount: result.gameRoomMission.strikeCount,
      projectStructure: withProjectStructureFileUrls(
        result.gameRoomMission.projectStructureJson,
      ),
    };
    const gameState = {
      status: result.gameRoom.status,
      strikeCount: result.gameRoomMission.strikeCount,
      maxStrikeCount: result.gameRoom.maxStrikeCount,
      turnState: {
        turnId: result.currentTurn.id,
        turnNumber: result.currentTurn.turnNumber,
        currentPlayerId: result.currentTurn.playerUserId,
        startedAt: toSeoulIso(result.currentTurn.startedAt),
        deadlineAt: toSeoulIso(result.currentTurn.deadlineAt),
        timeLimitSeconds: result.gameRoom.timeLimitSeconds,
        remainingTimeSeconds: result.gameRoom.timeLimitSeconds,
        status: result.currentTurn.status,
      },
    };

    await this.realtimeEventSupportService.publishGameStarted({
      gameRoomId: result.gameRoom.id,
      gameState,
      missionState,
      uiHints: {
        enterGameScreen: true,
        showMissionGuideModal: true,
      },
      occurredAt,
    });
    await this.realtimeEventSupportService.publishGameStateUpdated({
      gameRoomId: result.gameRoom.id,
      gameState,
      missionState,
      occurredAt,
    });

    return result;
  }
}

function withProjectStructureFileUrls(
  projectStructureJson: Record<string, unknown>,
): RealtimeProjectStructure {
  const projectStructure = isRecord(projectStructureJson) ? projectStructureJson : {};
  const files = Array.isArray(projectStructure.files) ? projectStructure.files : [];

  return {
    ...projectStructure,
    files: files
      .filter((file): file is Record<string, unknown> => isRecord(file))
      .map((file) => ({
        ...file,
        filePath: asString(file.filePath) ?? '',
        language:
          asString(file.language) ?? inferLanguageFromPath(asString(file.filePath)) ?? 'text',
        readonly: typeof file.readonly === 'boolean' ? file.readonly : false,
        fileUrl:
          asString(file.fileUrl) ??
          `data:text/plain;charset=utf-8,${encodeURIComponent(
            asString(file.content) ?? '',
          )}`,
      })),
  };
}

function inferLanguageFromPath(filePath: string | null): string | null {
  if (!filePath) {
    return null;
  }

  if (filePath.endsWith('.py')) {
    return 'python';
  }

  if (filePath.endsWith('.ts')) {
    return 'typescript';
  }

  if (filePath.endsWith('.js')) {
    return 'javascript';
  }

  return null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function buildMissionSteps(
  steps: GameRoomMissionStepEntity[] | null | undefined,
): RealtimeMissionStepSummary[] {
  if (!Array.isArray(steps)) {
    return [];
  }

  return steps
    .filter(
      (step): step is NonNullable<typeof step> =>
        Boolean(step?.id && step.missionTemplateStepId && step.stepOrder && step.status),
    )
    .map((step) => ({
      gameRoomMissionStepId: step.id!,
      missionTemplateStepId: step.missionTemplateStepId!,
      stepOrder: step.stepOrder!,
      title: asString(step.missionTemplateStep?.title) ?? '',
      description: asString(step.missionTemplateStep?.description) ?? '',
      status: step.status!,
      targetFilePath: asString(step.missionTemplateStep?.targetFilePath) ?? undefined,
    }))
    .sort((left, right) => left.stepOrder - right.stepOrder);
}
