import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { Repository } from 'typeorm';
import { AiPromptTemplate } from './entity/ai-prompt-template.entity';
import { PromptTemplateService } from './prompt-template.service';

export interface AiPromptTemplateSeedRecord {
  templateKey: string;
  templateName: string;
  purpose: string;
  templateText: string;
  variablesJson?: Record<string, string> | null;
  isActive?: boolean;
}

@Injectable()
export class PromptTemplateSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PromptTemplateSeedService.name);

  constructor(
    @InjectRepository(AiPromptTemplate)
    private readonly aiPromptTemplateRepository: Repository<AiPromptTemplate>,
    private readonly promptTemplateService: PromptTemplateService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const count = await this.upsertFromSeedFile();
      this.logger.log(`AI prompt templates seeded from file (${count} records)`);
    } catch (error) {
      this.logger.warn(
        `AI prompt template seed import failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    try {
      await this.promptTemplateService.refreshCache();
      this.logger.log('AI prompt template cache refreshed from database');
    } catch (error) {
      this.logger.warn(
        `AI prompt template cache refresh failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async upsertFromSeedFile(seedPath?: string): Promise<number> {
    const resolvedPath =
      seedPath ?? join(process.cwd(), 'database/seeds/ai_prompt_templates.json');
    const raw = await readFile(resolvedPath, 'utf-8');
    const records = JSON.parse(raw) as AiPromptTemplateSeedRecord[];

    let upserted = 0;
    for (const record of records) {
      await this.upsertRecord(record);
      upserted += 1;
    }
    return upserted;
  }

  private async upsertRecord(record: AiPromptTemplateSeedRecord): Promise<void> {
    const existing = await this.aiPromptTemplateRepository.findOne({
      where: { templateKey: record.templateKey },
    });

    if (existing) {
      existing.templateName = record.templateName;
      existing.purpose = record.purpose;
      existing.templateText = record.templateText;
      existing.variablesJson = record.variablesJson ?? null;
      existing.isActive = record.isActive ?? true;
      await this.aiPromptTemplateRepository.save(existing);
      return;
    }

    const created = this.aiPromptTemplateRepository.create({
      templateKey: record.templateKey,
      templateName: record.templateName,
      purpose: record.purpose,
      templateText: record.templateText,
      variablesJson: record.variablesJson ?? null,
      isActive: record.isActive ?? true,
    });
    await this.aiPromptTemplateRepository.save(created);
  }
}
