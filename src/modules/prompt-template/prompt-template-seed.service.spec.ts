import { PromptTemplateSeedService } from './prompt-template-seed.service';
import type { PromptTemplateService } from './prompt-template.service';

describe('PromptTemplateSeedService', () => {
  it('upserts seed records by template_key', async () => {
    const saved: unknown[] = [];
    const repository = {
      findOne: jest.fn(async ({ where }: { where: { templateKey: string } }) =>
        where.templateKey === 'chat_intent_parse'
          ? {
              templateKey: 'chat_intent_parse',
              templateName: 'old',
              purpose: 'chat_command',
              templateText: 'old text',
              variablesJson: null,
              isActive: true,
            }
          : null,
      ),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => {
        saved.push(value);
        return value;
      }),
    };

    const promptTemplateService = {
      refreshCache: jest.fn(),
    } as unknown as PromptTemplateService;

    const service = new PromptTemplateSeedService(
      repository as never,
      promptTemplateService,
    );

    const seedPath = `${process.cwd()}/database/seeds/ai_prompt_templates.json`;
    const count = await service.upsertFromSeedFile(seedPath);

    expect(count).toBeGreaterThan(0);
    expect(repository.save).toHaveBeenCalled();
    expect(saved.some((row) => (row as { templateKey: string }).templateKey === 'chat_intent_parse')).toBe(
      true,
    );
  });

  it('refreshes cache from DB when seed import fails', async () => {
    const repository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    const promptTemplateService = {
      refreshCache: jest.fn().mockResolvedValue(undefined),
    } as unknown as PromptTemplateService;

    const service = new PromptTemplateSeedService(
      repository as never,
      promptTemplateService,
    );

    jest.spyOn(service, 'upsertFromSeedFile').mockRejectedValue(new Error('ENOENT seed file'));
    await service.onApplicationBootstrap();

    expect(promptTemplateService.refreshCache).toHaveBeenCalledTimes(1);
  });

});
