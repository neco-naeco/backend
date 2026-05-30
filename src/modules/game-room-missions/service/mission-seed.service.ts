import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { DockerImageEntity } from '@modules/docker-images/entity/docker-image.entity';
import { MissionTemplateEntity } from '../entity/mission-template.entity';
import { MissionTemplateStepEntity } from '../entity/mission-template-step.entity';

export interface DockerImageSeedRecord {
  id: string;
  imageName: string;
  imageTag: string;
  imageUri: string;
  registryProvider: string;
  runtimeImageId?: string | null;
  language?: string | null;
  metadataJson?: Record<string, unknown> | null;
  deprecatedAt?: string | null;
}

export interface MissionTemplateSeedRecord {
  id: string;
  title: string;
  description: string;
  language: string;
  difficulty: string;
  defaultTimeLimitSeconds: number;
  defaultMaxStrikeCount: number;
  dockerImageId: string;
  successCriteria: string;
  judgePolicyJson: Record<string, unknown>;
  projectStructureJson: Record<string, unknown>;
}

export interface MissionTemplateStepSeedRecord {
  id: string;
  missionTemplateId: string;
  stepOrder: number;
  title: string;
  description: string;
  targetFilePath: string;
  successCriteria: string;
  judgePolicyJson: Record<string, unknown>;
  successCriteriaJson?: Record<string, unknown>;
  hintText: string;
}

@Injectable()
export class MissionSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MissionSeedService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const counts = await this.upsertFromSeedFiles();
      this.logger.log(
        `Mission seeds imported from files (${counts.dockerImages} docker images, ${counts.missionTemplates} templates, ${counts.missionTemplateSteps} steps)`,
      );
    } catch (error) {
      this.logger.error(
        `Mission seed import failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  async upsertFromSeedFiles(
    seedDir = join(process.cwd(), 'database/seeds'),
  ): Promise<{
    dockerImages: number;
    missionTemplates: number;
    missionTemplateSteps: number;
  }> {
    const [dockerImages, missionTemplates, missionTemplateSteps] = await Promise.all([
      readSeedFile<DockerImageSeedRecord>(
        join(seedDir, 'docker_images.json'),
      ),
      readSeedFile<MissionTemplateSeedRecord>(
        join(seedDir, 'mission_templates.json'),
      ),
      readSeedFile<MissionTemplateStepSeedRecord>(
        join(seedDir, 'mission_template_steps.json'),
      ),
    ]);

    await this.dataSource.transaction(async (manager) => {
      for (const record of dockerImages) {
        await this.upsertDockerImage(manager, record);
      }

      for (const record of missionTemplates) {
        await this.upsertMissionTemplate(manager, record);
      }

      for (const record of missionTemplateSteps) {
        await this.upsertMissionTemplateStep(manager, record);
      }
    });

    return {
      dockerImages: dockerImages.length,
      missionTemplates: missionTemplates.length,
      missionTemplateSteps: missionTemplateSteps.length,
    };
  }

  private async upsertDockerImage(
    manager: EntityManager,
    record: DockerImageSeedRecord,
  ): Promise<void> {
    const repository = manager.getRepository(DockerImageEntity);
    const entity = await findByIdOrCreate(repository, record.id);

    entity.imageName = record.imageName;
    entity.imageTag = record.imageTag;
    entity.imageUri = record.imageUri;
    entity.registryProvider = record.registryProvider;
    entity.runtimeImageId = record.runtimeImageId ?? null;
    entity.language = record.language ?? null;
    entity.metadataJson = record.metadataJson ?? null;
    entity.deprecatedAt = record.deprecatedAt ? new Date(record.deprecatedAt) : null;

    await repository.save(entity);
  }

  private async upsertMissionTemplate(
    manager: EntityManager,
    record: MissionTemplateSeedRecord,
  ): Promise<void> {
    const repository = manager.getRepository(MissionTemplateEntity);
    const entity = await findByIdOrCreate(repository, record.id);

    entity.title = record.title;
    entity.description = record.description;
    entity.language = record.language;
    entity.difficulty = record.difficulty;
    entity.defaultTimeLimitSeconds = record.defaultTimeLimitSeconds;
    entity.defaultMaxStrikeCount = record.defaultMaxStrikeCount;
    entity.dockerImageId = record.dockerImageId;
    entity.successCriteria = record.successCriteria;
    entity.judgePolicyJson = record.judgePolicyJson;
    entity.projectStructureJson = record.projectStructureJson;

    await repository.save(entity);
  }

  private async upsertMissionTemplateStep(
    manager: EntityManager,
    record: MissionTemplateStepSeedRecord,
  ): Promise<void> {
    const repository = manager.getRepository(MissionTemplateStepEntity);
    const entity =
      (await findById(repository, record.id)) ??
      (await repository.findOne({
        where: {
          missionTemplateId: record.missionTemplateId,
          stepOrder: record.stepOrder,
        },
      })) ??
      ({ id: record.id } as MissionTemplateStepEntity);

    entity.missionTemplateId = record.missionTemplateId;
    entity.stepOrder = record.stepOrder;
    entity.title = record.title;
    entity.description = record.description;
    entity.targetFilePath = record.targetFilePath;
    entity.successCriteria = record.successCriteria;
    entity.judgePolicyJson = record.judgePolicyJson;
    entity.successCriteriaJson = record.successCriteriaJson ?? {};
    entity.hintText = record.hintText;

    await repository.save(entity);
  }
}

async function readSeedFile<T>(seedPath: string): Promise<T[]> {
  const raw = await readFile(seedPath, 'utf-8');
  return JSON.parse(raw) as T[];
}

async function findByIdOrCreate<T extends { id: string }>(
  repository: Repository<T>,
  id: string,
): Promise<T> {
  const existing = await repository.findOne({ where: { id } as never });
  if (existing) {
    return existing;
  }

  return { id } as T;
}

async function findById<T extends { id: string }>(
  repository: Repository<T>,
  id: string,
): Promise<T | null> {
  return repository.findOne({ where: { id } as never });
}
