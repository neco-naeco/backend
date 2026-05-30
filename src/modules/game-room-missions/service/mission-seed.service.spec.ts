/// <reference types="jest" />

import {
  DataSource,
  EntityManager,
  FindOneOptions,
  ObjectLiteral,
  Repository,
} from 'typeorm';
import { DockerImageEntity } from '@modules/docker-images/entity/docker-image.entity';
import { MissionTemplateEntity } from '../entity/mission-template.entity';
import { MissionTemplateStepEntity } from '../entity/mission-template-step.entity';
import { MissionSeedService } from './mission-seed.service';

describe('MissionSeedService', () => {
  it('upserts calculator mission seed records deterministically', async () => {
    const saved: unknown[] = [];
    const dockerImageRepository = createRepositoryMock<DockerImageEntity>();
    const missionTemplateRepository = createRepositoryMock<MissionTemplateEntity>();
    const missionTemplateStepRepository =
      createRepositoryMock<MissionTemplateStepEntity>();

    for (const repository of [
      dockerImageRepository,
      missionTemplateRepository,
      missionTemplateStepRepository,
    ]) {
      repository.create.mockImplementation((value) => value as never);
      repository.save.mockImplementation(async (value) => {
        saved.push(value);
        return value as never;
      });
    }

    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === DockerImageEntity) {
          return dockerImageRepository;
        }

        if (entity === MissionTemplateEntity) {
          return missionTemplateRepository;
        }

        return missionTemplateStepRepository;
      }),
    } as unknown as EntityManager;
    const dataSource = {
      transaction: jest.fn(async (callback) => callback(manager)),
    } as unknown as DataSource;

    const service = new MissionSeedService(dataSource);
    const counts = await service.upsertFromSeedFiles();

    expect(counts).toEqual({
      dockerImages: 1,
      missionTemplates: 1,
      missionTemplateSteps: 6,
    });
    expect(dockerImageRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '11111111-1111-4111-8111-111111111111',
        imageUri: 'neconaeco/python-runner:python-3.12-v1',
        language: 'python',
      }),
    );
    expect(missionTemplateRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '22222222-2222-4222-8222-222222222222',
        language: 'python',
        dockerImageId: '11111111-1111-4111-8111-111111111111',
        projectStructureJson: expect.objectContaining({
          entryFilePath: 'main.py',
          files: expect.arrayContaining([
            expect.objectContaining({
              filePath: 'main.py',
              readonly: false,
            }),
            expect.objectContaining({
              filePath: 'README.md',
              readonly: true,
            }),
          ]),
        }),
      }),
    );
    const savedTemplate = missionTemplateRepository.save.mock.calls[0]?.[0] as
      | MissionTemplateEntity
      | undefined;
    const judgeSteps = savedTemplate?.judgePolicyJson.steps as
      | Array<{ stepOrder: number; testCases: Array<{ name: string }> }>
      | undefined;
    const finalStepCases =
      judgeSteps?.find((step) => step.stepOrder === 6)?.testCases.map(
        (testCase) => testCase.name,
      ) ?? [];

    expect(judgeSteps).toHaveLength(6);
    expect(finalStepCases).toEqual(
      expect.arrayContaining([
        'add_positive_integers',
        'subtract_positive_integers',
        'multiply_positive_integers',
        'divide_decimal',
        'divide_evenly',
        'division_by_zero',
        'unsupported_operator',
        'invalid_left_number',
      ]),
    );
    expect(saved).toContainEqual(
      expect.objectContaining({
        id: '33333333-3333-4333-8333-333333333331',
        stepOrder: 1,
      }),
    );
    expect(missionTemplateStepRepository.save).toHaveBeenCalledTimes(6);
  });

  it('does not rewrite existing mission step primary keys on reseed', async () => {
    const saved: unknown[] = [];
    const dockerImageRepository = createRepositoryMock<DockerImageEntity>();
    const missionTemplateRepository = createRepositoryMock<MissionTemplateEntity>();
    const missionTemplateStepRepository =
      createRepositoryMock<MissionTemplateStepEntity>();

    missionTemplateStepRepository.findOne.mockImplementation(
      async (options: FindOneOptions<MissionTemplateStepEntity>) =>
        isExistingLogicalStepQuery(options)
          ? ({
              id: 'existing-live-step-id',
              missionTemplateId: options.where.missionTemplateId,
              stepOrder: options.where.stepOrder,
            } as MissionTemplateStepEntity)
          : null,
    );

    for (const repository of [
      dockerImageRepository,
      missionTemplateRepository,
      missionTemplateStepRepository,
    ]) {
      repository.save.mockImplementation(async (value) => {
        saved.push(value);
        return value as never;
      });
    }

    const dataSource = {
      transaction: jest.fn(async (callback) => callback(createManagerMock({
        dockerImageRepository,
        missionTemplateRepository,
        missionTemplateStepRepository,
      }))),
    } as unknown as DataSource;

    const service = new MissionSeedService(dataSource);
    await service.upsertFromSeedFiles();

    expect(saved).toContainEqual(
      expect.objectContaining({
        id: 'existing-live-step-id',
        missionTemplateId: '22222222-2222-4222-8222-222222222222',
        stepOrder: 1,
      }),
    );
    expect(saved).not.toContainEqual(
      expect.objectContaining({
        id: '33333333-3333-4333-8333-333333333331',
        stepOrder: 1,
      }),
    );
  });

  it('fails bootstrap when required mission seed import fails', async () => {
    const dataSource = {
      transaction: jest.fn(),
    } as unknown as DataSource;
    const service = new MissionSeedService(dataSource);

    jest.spyOn(service, 'upsertFromSeedFiles').mockRejectedValue(new Error('ENOENT'));

    await expect(service.onApplicationBootstrap()).rejects.toThrow('ENOENT');
  });
});

function createManagerMock(input: {
  dockerImageRepository: jest.Mocked<
    Pick<Repository<DockerImageEntity>, 'create' | 'findOne' | 'save'>
  >;
  missionTemplateRepository: jest.Mocked<
    Pick<Repository<MissionTemplateEntity>, 'create' | 'findOne' | 'save'>
  >;
  missionTemplateStepRepository: jest.Mocked<
    Pick<Repository<MissionTemplateStepEntity>, 'create' | 'findOne' | 'save'>
  >;
}): EntityManager {
  return {
    getRepository: jest.fn((entity) => {
      if (entity === DockerImageEntity) {
        return input.dockerImageRepository;
      }

      if (entity === MissionTemplateEntity) {
        return input.missionTemplateRepository;
      }

      return input.missionTemplateStepRepository;
    }),
  } as unknown as EntityManager;
}

function createRepositoryMock<T extends ObjectLiteral>(): jest.Mocked<
  Pick<Repository<T>, 'create' | 'findOne' | 'save'>
> {
  return {
    create: jest.fn(),
    findOne: jest.fn(async (_options: FindOneOptions<T>) => null),
    save: jest.fn(),
  };
}

function isExistingLogicalStepQuery(
  options: FindOneOptions<MissionTemplateStepEntity>,
): options is FindOneOptions<MissionTemplateStepEntity> & {
  where: { missionTemplateId: string; stepOrder: 1 };
} {
  return (
    typeof options.where === 'object' &&
    options.where !== null &&
    !Array.isArray(options.where) &&
    options.where.stepOrder === 1 &&
    typeof options.where.missionTemplateId === 'string'
  );
}
