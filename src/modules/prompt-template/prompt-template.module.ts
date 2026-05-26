import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiPromptTemplate } from './entity/ai-prompt-template.entity';
import { PromptTemplateSeedService } from './prompt-template-seed.service';
import { PromptTemplateService } from './prompt-template.service';

@Module({
  imports: [TypeOrmModule.forFeature([AiPromptTemplate])],
  providers: [PromptTemplateService, PromptTemplateSeedService],
  exports: [PromptTemplateService, TypeOrmModule],
})
export class PromptTemplateModule {}
