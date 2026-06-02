import { Injectable, NotFoundException } from '@nestjs/common';
import { toSeoulIso } from '@common/utils/date.util';
import { User } from '@modules/auth/entity/user.entity';
import { GameRoomMissionStepEntity } from '@modules/game-room-missions/entity/game-room-mission-step.entity';
import { GameRoomMissionEntity } from '@modules/game-room-missions/entity/game-room-mission.entity';
import { MissionTemplateEntity } from '@modules/game-room-missions/entity/mission-template.entity';
import { GameRoomParticipantEntity } from '@modules/game-room-participants/entity/game-room-participant.entity';
import { GameRoomEntity } from '@modules/game-rooms/entity/game-room.entity';
import { TurnEntity } from '@modules/turns/entity/turn.entity';
import {
  GameRoomParticipantMembershipStatus,
  GameRoomStatus,
  TurnStatus,
} from '@shared/enums';
import { DataSource, In } from 'typeorm';
import type {
  RealtimeMissionStepSummary,
  RealtimeProjectStructure,
  RealtimeMissionState,
  RoomParticipantView,
  RoomParticipantsUpdatedEvent,
} from './realtime.interfaces';

export interface RoomRealtimeContext {
  room: GameRoomEntity;
  participants: RoomParticipantView[];
  gameState: Record<string, unknown>;
  missionState: RealtimeMissionState | null;
}

@Injectable()
export class RealtimeRoomStateService {
  constructor(private readonly dataSource: DataSource) {}

  async buildParticipantsUpdatedEvent(input: {
    gameRoomId: string;
    changedUserId?: string | null;
    occurredAt?: string;
  }): Promise<RoomParticipantsUpdatedEvent> {
    const context = await this.loadRoomRealtimeContext(input.gameRoomId);
    const changedParticipant =
      input.changedUserId === undefined
        ? null
        : context.participants.find(
            (participant) => participant.userId === input.changedUserId,
          ) ?? null;

    return {
      gameRoomId: input.gameRoomId,
      participants: context.participants,
      changedParticipant,
      gameState: context.gameState,
      missionState: context.missionState,
      occurredAt: input.occurredAt ?? toSeoulIso(new Date()),
    };
  }

  async loadRoomRealtimeContext(gameRoomId: string): Promise<RoomRealtimeContext> {
    const roomRepository = this.dataSource.getRepository(GameRoomEntity);
    const room = await roomRepository.findOne({
      where: { id: gameRoomId },
    });

    if (!room) {
      throw new NotFoundException({
        code: 'GAME_ROOM_NOT_FOUND',
        message: 'Game room was not found.',
      });
    }

    const participantRepository = this.dataSource.getRepository(
      GameRoomParticipantEntity,
    );
    const participants = await participantRepository.find({
      where: { gameRoomId },
      order: { createdAt: 'ASC' },
    });
    const nicknameByUserId = await this.loadNicknameByUserId(
      participants.map((participant) => participant.userId),
    );
    const participantViews = participants.map((participant) =>
      toParticipantView(participant, nicknameByUserId),
    );

    if (room.status !== GameRoomStatus.IN_PROGRESS) {
      return {
        room,
        participants: participantViews,
        gameState: {
          status: room.status,
        },
        missionState: null,
      };
    }

    const missionRepository = this.dataSource.getRepository(GameRoomMissionEntity);
    const mission = await missionRepository.findOne({
      where: { gameRoomId },
    });
    if (mission) {
      mission.missionTemplate =
        await this.dataSource.getRepository(MissionTemplateEntity).findOne({
          where: { id: mission.missionTemplateId },
        }) ?? mission.missionTemplate;
    }
    const missionSteps = mission
      ? await this.dataSource.getRepository(GameRoomMissionStepEntity).find({
          where: { gameRoomMissionId: mission.id },
          relations: { missionTemplateStep: true },
          order: { stepOrder: 'ASC' },
        })
      : [];
    const currentStep = mission?.currentStepId
      ? await this.dataSource.getRepository(GameRoomMissionStepEntity).findOne({
          where: { id: mission.currentStepId },
          relations: { missionTemplateStep: true },
        })
      : null;
    const currentTurn = await this.dataSource.getRepository(TurnEntity).findOne({
      where: {
        gameRoomId,
        status: TurnStatus.IN_PROGRESS,
      },
      order: {
        turnNumber: 'DESC',
      },
    });

    return {
      room,
      participants: participantViews,
      gameState: buildInProgressGameState(room, mission, currentTurn),
      missionState: mission
        ? buildMissionState(room, mission, currentStep, missionSteps)
        : null,
    };
  }

  private async loadNicknameByUserId(
    userIds: string[],
  ): Promise<Map<string, string>> {
    const uniqueUserIds = [...new Set(userIds)];

    if (uniqueUserIds.length === 0) {
      return new Map();
    }

    const users = await this.dataSource.getRepository(User).find({
      where: {
        id: In(uniqueUserIds),
      },
    });

    return new Map(users.map((user) => [user.id, user.nickname] as const));
  }
}

function toParticipantView(
  participant: GameRoomParticipantEntity,
  nicknameByUserId: Map<string, string>,
): RoomParticipantView {
  return {
    userId: participant.userId,
    nickname: nicknameByUserId.get(participant.userId) ?? participant.userId,
    role: participant.role,
    membershipStatus: participant.membershipStatus,
  };
}

function buildInProgressGameState(
  room: GameRoomEntity,
  mission: GameRoomMissionEntity | null,
  currentTurn: TurnEntity | null,
): Record<string, unknown> {
  return {
    status: room.status,
    strikeCount: mission?.strikeCount ?? 0,
    maxStrikeCount: room.maxStrikeCount,
    turnState: currentTurn
      ? {
          turnId: currentTurn.id,
          turnNumber: currentTurn.turnNumber,
          currentPlayerId: currentTurn.playerUserId,
          startedAt: toSeoulIso(currentTurn.startedAt),
          deadlineAt: toSeoulIso(currentTurn.deadlineAt),
          timeLimitSeconds: room.timeLimitSeconds,
          remainingTimeSeconds: Math.max(
            0,
            Math.ceil(
              (currentTurn.deadlineAt.getTime() - Date.now()) / 1000,
            ),
          ),
          status: currentTurn.status,
        }
      : null,
  };
}

function buildMissionState(
  room: GameRoomEntity,
  mission: GameRoomMissionEntity,
  currentStep: GameRoomMissionStepEntity | null,
  missionSteps: GameRoomMissionStepEntity[],
): RealtimeMissionState {
  return {
    missionId: mission.id,
    missionTemplateId: mission.missionTemplateId,
    currentStepId: currentStep?.id ?? null,
    currentStepStatus: currentStep?.status ?? null,
    gameRoomMissionStepId: currentStep?.id ?? null,
    missionTemplateStepId: currentStep?.missionTemplateStepId ?? null,
    stepOrder: currentStep?.stepOrder ?? null,
    stepTitle: currentStep?.missionTemplateStep?.title ?? '',
    stepDescription: currentStep?.missionTemplateStep?.description ?? '',
    steps: buildMissionSteps(missionSteps),
    title: mission.missionTemplate?.title ?? '',
    description: mission.missionTemplate?.description ?? '',
    language: mission.missionTemplate?.language ?? '',
    difficulty: room.difficulty,
    strikeCount: mission.strikeCount,
    projectStructure: toRealtimeProjectStructure(mission.projectStructureJson),
  };
}

function buildMissionSteps(
  missionSteps: GameRoomMissionStepEntity[] | null | undefined,
): RealtimeMissionStepSummary[] {
  if (!Array.isArray(missionSteps)) {
    return [];
  }

  return missionSteps.map((step) => ({
    gameRoomMissionStepId: step.id,
    missionTemplateStepId: step.missionTemplateStepId,
    stepOrder: step.stepOrder,
    title: step.missionTemplateStep?.title ?? '',
    description: step.missionTemplateStep?.description ?? '',
    status: step.status,
    targetFilePath: step.missionTemplateStep?.targetFilePath,
  }));
}

function toRealtimeProjectStructure(
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
        language: asString(file.language) ?? inferLanguageFromPath(asString(file.filePath)) ?? 'text',
        readonly: typeof file.readonly === 'boolean' ? file.readonly : false,
        fileUrl:
          asString(file.fileUrl) ??
          `data:text/plain;charset=utf-8,${encodeURIComponent(asString(file.content) ?? '')}`,
      })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
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
