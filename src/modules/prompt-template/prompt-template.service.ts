import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiPromptTemplate } from './entity/ai-prompt-template.entity';
import { compactRenderedPrompt, renderPromptTemplate } from './render-prompt-template';

@Injectable()
export class PromptTemplateService {
  private readonly cache = new Map<string, AiPromptTemplate>();

  constructor(
    @InjectRepository(AiPromptTemplate)
    private readonly aiPromptTemplateRepository: Repository<AiPromptTemplate>,
  ) {}

  async refreshCache(): Promise<void> {
    const templates = await this.aiPromptTemplateRepository.find({
      where: { isActive: true },
    });
    this.cache.clear();
    for (const template of templates) {
      this.cache.set(template.templateKey, template);
    }
  }

  getActiveTemplate(templateKey: string): AiPromptTemplate | null {
    return this.cache.get(templateKey) ?? null;
  }

  renderTemplate(
    templateKey: string,
    variables: Record<string, string | number | undefined | null>,
  ): string | null {
    const template = this.getActiveTemplate(templateKey);
    if (!template) {
      return null;
    }
    return compactRenderedPrompt(renderPromptTemplate(template.templateText, variables));
  }
}
