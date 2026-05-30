import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { RUNTIME_ADAPTER } from '@integrations/runtime/runtime.constants';
import type { RuntimeAdapter } from '@integrations/runtime/runtime.interfaces';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { DockerImageEntity } from '@modules/docker-images/entity/docker-image.entity';
import { GameRoomParticipantEntity } from '@modules/game-room-participants/entity/game-room-participant.entity';
import {
  GameRoomMissionStepStatus,
  GameRoomParticipantMembershipStatus,
} from '@shared/enums';
import { GameRoomMissionEntity } from '../entity/game-room-mission.entity';
import { GameRoomMissionStepEntity } from '../entity/game-room-mission-step.entity';
import { MissionTemplateEntity } from '../entity/mission-template.entity';
import { MissionTemplateStepEntity } from '../entity/mission-template-step.entity';

export interface CreateGameRoomMissionInput {
  manager: EntityManager;
  gameRoomId: string;
  roomDifficulty: string;
  missionTemplateId: string;
}

export interface CurrentMissionStepHint {
  missionId: string;
  stepId: string;
  stepOrder: number;
  status: GameRoomMissionStepStatus;
  targetFilePath: string;
  hintText: string;
}

export interface TransitionCurrentStepInput {
  manager: EntityManager;
  gameRoomMissionId: string;
}

export interface RecordFailedAttemptInput extends TransitionCurrentStepInput {
  strikeLimit: number;
}

export interface CompleteCurrentStepResult {
  mission: GameRoomMissionEntity;
  clearedStep: GameRoomMissionStepEntity;
  nextStep: GameRoomMissionStepEntity | null;
  missionFinished: boolean;
}

export interface RecordFailedAttemptResult {
  mission: GameRoomMissionEntity;
  currentStep: GameRoomMissionStepEntity;
  strikeLimitReached: boolean;
  missionFinished: boolean;
}

const ALLOWED_STEP_TRANSITIONS: Record<
  GameRoomMissionStepStatus,
  GameRoomMissionStepStatus[]
> = {
  [GameRoomMissionStepStatus.LOCKED]: [GameRoomMissionStepStatus.READY],
  [GameRoomMissionStepStatus.READY]: [
    GameRoomMissionStepStatus.IN_PROGRESS,
    GameRoomMissionStepStatus.CLEARED,
    GameRoomMissionStepStatus.FAILED,
  ],
  [GameRoomMissionStepStatus.IN_PROGRESS]: [
    GameRoomMissionStepStatus.READY,
    GameRoomMissionStepStatus.CLEARED,
    GameRoomMissionStepStatus.FAILED,
  ],
  [GameRoomMissionStepStatus.CLEARED]: [],
  [GameRoomMissionStepStatus.FAILED]: [],
};

const RUNTIME_CONTAINER_PREPARATION_FAILED_MESSAGE =
  'Failed to prepare the mission runtime container.';

@Injectable()
export class GameRoomMissionsService {
  private readonly logger = new Logger(GameRoomMissionsService.name);

  constructor(
    private readonly dataSource: DataSource,
    @Inject(RUNTIME_ADAPTER)
    private readonly runtimeAdapter: RuntimeAdapter,
  ) {}

  async releasePreparedRuntimeContainer(containerId: string): Promise<void> {
    try {
      await this.runtimeAdapter.removeMissionContainer({ containerId });
    } catch (error) {
      this.logger.warn(
        `Failed to remove prepared runtime container ${containerId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async validateMissionTemplateSelection(
    roomDifficulty: string,
    missionTemplateId: string,
  ): Promise<MissionTemplateEntity> {
    const missionTemplateRepository =
      this.dataSource.getRepository(MissionTemplateEntity);
    const missionTemplateStepRepository = this.dataSource.getRepository(
      MissionTemplateStepEntity,
    );

    const missionTemplate = await missionTemplateRepository.findOne({
      where: { id: missionTemplateId },
      relations: { dockerImage: true },
    });

    if (!missionTemplate) {
      throw new NotFoundException({
        code: 'MISSION_TEMPLATE_NOT_FOUND',
        message: 'Mission template was not found.',
      });
    }

    this.ensureMissionTemplateDockerImage(missionTemplate.dockerImage);

    if (missionTemplate.difficulty !== roomDifficulty) {
      throw new ConflictException({
        code: 'MISSION_TEMPLATE_DIFFICULTY_MISMATCH',
        message: 'Mission template difficulty does not match the room difficulty.',
      });
    }

    const missionTemplateSteps = await missionTemplateStepRepository.find({
      where: { missionTemplateId: missionTemplate.id },
      order: { stepOrder: 'ASC' },
    });

    if (missionTemplateSteps.length === 0) {
      throw new ConflictException({
        code: 'MISSION_TEMPLATE_STEPS_REQUIRED',
        message: 'Mission template must have at least one step.',
      });
    }

    return missionTemplate;
  }

  async createMissionForGameStart(
    input: CreateGameRoomMissionInput,
  ): Promise<GameRoomMissionEntity> {
    const missionTemplateStepRepository = input.manager.getRepository(
      MissionTemplateStepEntity,
    );
    const gameRoomMissionRepository =
      input.manager.getRepository(GameRoomMissionEntity);
    const gameRoomMissionStepRepository = input.manager.getRepository(
      GameRoomMissionStepEntity,
    );

    await this.ensureNoExistingMission(gameRoomMissionRepository, input.gameRoomId);

    const missionTemplate = await this.validateMissionTemplateSelection(
      input.roomDifficulty,
      input.missionTemplateId,
    );
    const missionTemplateSteps = await missionTemplateStepRepository.find({
      where: { missionTemplateId: missionTemplate.id },
      order: { stepOrder: 'ASC' },
    });

    const missionId = randomUUID();
    let runtimeContainerId: string | null = null;

    try {
      runtimeContainerId = await this.prepareRuntimeContainer({
        gameRoomId: input.gameRoomId,
        missionId,
        dockerImage: missionTemplate.dockerImage,
      });

      const gameRoomMission = gameRoomMissionRepository.create({
        id: missionId,
        gameRoomId: input.gameRoomId,
        missionTemplateId: missionTemplate.id,
        currentStepId: null,
        containerId: runtimeContainerId,
        strikeCount: 0,
        judgePolicyJson: missionTemplate.judgePolicyJson,
        projectStructureJson: missionTemplate.projectStructureJson,
        startedAt: new Date(),
        finishedAt: null,
      });

      const savedGameRoomMission = await gameRoomMissionRepository.save(gameRoomMission);
      const gameRoomMissionSteps = missionTemplateSteps.map((missionTemplateStep, index) =>
        gameRoomMissionStepRepository.create({
          gameRoomMissionId: savedGameRoomMission.id,
          missionTemplateStepId: missionTemplateStep.id,
          stepOrder: missionTemplateStep.stepOrder,
          status:
            index === 0
              ? GameRoomMissionStepStatus.READY
              : GameRoomMissionStepStatus.LOCKED,
        }),
      );

      const savedGameRoomMissionSteps =
        await gameRoomMissionStepRepository.save(gameRoomMissionSteps);
      const firstStep = savedGameRoomMissionSteps[0];

      savedGameRoomMission.currentStepId = firstStep.id;

      return gameRoomMissionRepository.save(savedGameRoomMission);
    } catch (error) {
      if (runtimeContainerId) {
        await this.releasePreparedRuntimeContainer(runtimeContainerId);
      }

      throw error;
    }
  }

  async getCurrentStepHint(
    actorUserId: string,
    missionId: string,
  ): Promise<CurrentMissionStepHint> {
    const missionRepository = this.dataSource.getRepository(GameRoomMissionEntity);
    const participantRepository = this.dataSource.getRepository(
      GameRoomParticipantEntity,
    );
    const missionStepRepository = this.dataSource.getRepository(
      GameRoomMissionStepEntity,
    );

    const mission = await this.getMissionOrThrow(missionRepository, missionId);
    await this.ensureJoinedMissionAccess(
      participantRepository,
      mission.gameRoomId,
      actorUserId,
    );

    const currentStep = await this.getCurrentStepOrThrow(
      missionStepRepository,
      mission,
    );

    return {
      missionId: mission.id,
      stepId: currentStep.id,
      stepOrder: currentStep.stepOrder,
      status: currentStep.status,
      targetFilePath: currentStep.missionTemplateStep.targetFilePath,
      hintText: currentStep.missionTemplateStep.hintText,
    };
  }

  async transitionCurrentStepToInProgress(
    input: TransitionCurrentStepInput,
  ): Promise<GameRoomMissionStepEntity> {
    const missionRepository = input.manager.getRepository(GameRoomMissionEntity);
    const missionStepRepository = input.manager.getRepository(
      GameRoomMissionStepEntity,
    );
    const mission = await this.getMissionOrThrow(
      missionRepository,
      input.gameRoomMissionId,
    );
    const currentStep = await this.getCurrentStepOrThrow(
      missionStepRepository,
      mission,
    );

    this.ensureStepTransition(
      currentStep.status,
      GameRoomMissionStepStatus.IN_PROGRESS,
    );
    currentStep.status = GameRoomMissionStepStatus.IN_PROGRESS;

    return missionStepRepository.save(currentStep);
  }

  async completeCurrentStep(
    input: TransitionCurrentStepInput,
  ): Promise<CompleteCurrentStepResult> {
    const missionRepository = input.manager.getRepository(GameRoomMissionEntity);
    const missionStepRepository = input.manager.getRepository(
      GameRoomMissionStepEntity,
    );
    const mission = await this.getMissionOrThrow(
      missionRepository,
      input.gameRoomMissionId,
    );
    const currentStep = await this.getCurrentStepOrThrow(
      missionStepRepository,
      mission,
    );

    this.ensureStepTransition(currentStep.status, GameRoomMissionStepStatus.CLEARED);
    currentStep.status = GameRoomMissionStepStatus.CLEARED;
    const clearedStep = await missionStepRepository.save(currentStep);
    const nextStep = await missionStepRepository.findOne({
      relations: { missionTemplateStep: true },
      where: {
        gameRoomMissionId: mission.id,
        stepOrder: currentStep.stepOrder + 1,
      },
    });

    if (!nextStep) {
      mission.currentStepId = null;
      mission.finishedAt = new Date();

      return {
        mission: await missionRepository.save(mission),
        clearedStep,
        nextStep: null,
        missionFinished: true,
      };
    }

    this.ensureStepTransition(nextStep.status, GameRoomMissionStepStatus.READY);
    nextStep.status = GameRoomMissionStepStatus.READY;
    const savedNextStep = await missionStepRepository.save(nextStep);

    mission.currentStepId = savedNextStep.id;
    mission.finishedAt = null;

    return {
      mission: await missionRepository.save(mission),
      clearedStep,
      nextStep: savedNextStep,
      missionFinished: false,
    };
  }

  async recordFailedAttempt(
    input: RecordFailedAttemptInput,
  ): Promise<RecordFailedAttemptResult> {
    const missionRepository = input.manager.getRepository(GameRoomMissionEntity);
    const missionStepRepository = input.manager.getRepository(
      GameRoomMissionStepEntity,
    );
    const mission = await this.getMissionOrThrow(
      missionRepository,
      input.gameRoomMissionId,
    );
    const currentStep = await this.getCurrentStepOrThrow(
      missionStepRepository,
      mission,
    );

    mission.strikeCount += 1;

    if (mission.strikeCount >= input.strikeLimit) {
      this.ensureStepTransition(currentStep.status, GameRoomMissionStepStatus.FAILED);
      currentStep.status = GameRoomMissionStepStatus.FAILED;

      const failedStep = await missionStepRepository.save(currentStep);
      mission.currentStepId = null;
      mission.finishedAt = new Date();

      return {
        mission: await missionRepository.save(mission),
        currentStep: failedStep,
        strikeLimitReached: true,
        missionFinished: true,
      };
    }

    if (currentStep.status === GameRoomMissionStepStatus.IN_PROGRESS) {
      this.ensureStepTransition(currentStep.status, GameRoomMissionStepStatus.READY);
      currentStep.status = GameRoomMissionStepStatus.READY;
    } else if (currentStep.status !== GameRoomMissionStepStatus.READY) {
      throw new ConflictException({
        code: 'INVALID_MISSION_STEP_FAILURE_STATE',
        message: 'Current mission step cannot remain active after a failed attempt.',
      });
    }

    return {
      mission: await missionRepository.save(mission),
      currentStep: await missionStepRepository.save(currentStep),
      strikeLimitReached: false,
      missionFinished: false,
    };
  }

  private ensureMissionTemplateDockerImage(
    dockerImage: DockerImageEntity | null | undefined,
  ): void {
    if (!dockerImage) {
      throw new NotFoundException({
        code: 'MISSION_TEMPLATE_DOCKER_IMAGE_NOT_FOUND',
        message: 'Mission template docker image was not found.',
      });
    }
  }

  private async prepareRuntimeContainer(input: {
    gameRoomId: string;
    missionId: string;
    dockerImage: DockerImageEntity;
  }): Promise<string> {
    const keepAliveCommand = resolveKeepAliveCommand(input.dockerImage.metadataJson);

    try {
      const runtimeContainer = await this.runtimeAdapter.prepareMissionContainer({
        gameRoomId: input.gameRoomId,
        missionId: input.missionId,
        image: input.dockerImage.imageUri,
        keepAliveCommand,
      });

      return runtimeContainer.containerId;
    } catch (error) {
      this.logger.error(
        'Mission runtime container preparation failed',
        error instanceof Error ? error.stack : String(error),
      );

      throw new ServiceUnavailableException({
        code: 'RUNTIME_CONTAINER_PREPARATION_FAILED',
        message: RUNTIME_CONTAINER_PREPARATION_FAILED_MESSAGE,
      });
    }
  }

  private async ensureNoExistingMission(
    gameRoomMissionRepository: Repository<GameRoomMissionEntity>,
    gameRoomId: string,
  ): Promise<void> {
    const existingMission = await gameRoomMissionRepository.findOne({
      where: { gameRoomId },
    });

    if (existingMission) {
      throw new ConflictException({
        code: 'GAME_ROOM_MISSION_ALREADY_EXISTS',
        message: 'A mission already exists for this room.',
      });
    }
  }

  private async getMissionOrThrow(
    missionRepository: Repository<GameRoomMissionEntity>,
    missionId: string,
  ): Promise<GameRoomMissionEntity> {
    const mission = await missionRepository.findOne({
      where: { id: missionId },
    });

    if (!mission) {
      throw new NotFoundException({
        code: 'GAME_ROOM_MISSION_NOT_FOUND',
        message: 'Game room mission was not found.',
      });
    }

    return mission;
  }

  private async ensureJoinedMissionAccess(
    participantRepository: Repository<GameRoomParticipantEntity>,
    gameRoomId: string,
    actorUserId: string,
  ): Promise<void> {
    const membership = await participantRepository.findOne({
      where: {
        gameRoomId,
        userId: actorUserId,
        membershipStatus: GameRoomParticipantMembershipStatus.JOINED,
      },
    });

    if (!membership) {
      throw new ForbiddenException({
        code: 'GAME_ROOM_MISSION_ACCESS_DENIED',
        message: 'User cannot access this mission.',
      });
    }
  }

  private async getCurrentStepOrThrow(
    missionStepRepository: Repository<GameRoomMissionStepEntity>,
    mission: GameRoomMissionEntity,
  ): Promise<GameRoomMissionStepEntity> {
    if (!mission.currentStepId) {
      throw new ConflictException({
        code: 'CURRENT_MISSION_STEP_UNAVAILABLE',
        message: 'Current mission step is not available.',
      });
    }

    const currentStep = await missionStepRepository.findOne({
      relations: { missionTemplateStep: true },
      where: {
        id: mission.currentStepId,
        gameRoomMissionId: mission.id,
      },
    });

    if (!currentStep) {
      throw new ConflictException({
        code: 'CURRENT_MISSION_STEP_NOT_FOUND',
        message: 'Current mission step was not found.',
      });
    }

    return currentStep;
  }

  private ensureStepTransition(
    currentStatus: GameRoomMissionStepStatus,
    nextStatus: GameRoomMissionStepStatus,
  ): void {
    const allowedStatuses = ALLOWED_STEP_TRANSITIONS[currentStatus];

    if (!allowedStatuses.includes(nextStatus)) {
      throw new ConflictException({
        code: 'INVALID_MISSION_STEP_TRANSITION',
        message: `Cannot change mission step from ${currentStatus} to ${nextStatus}.`,
      });
    }
  }
}

function resolveKeepAliveCommand(
  metadataJson: Record<string, unknown> | null,
): string | undefined {
  const keepAliveCommand = metadataJson?.keepAliveCommand;

  return typeof keepAliveCommand === 'string' ? keepAliveCommand : undefined;
}
