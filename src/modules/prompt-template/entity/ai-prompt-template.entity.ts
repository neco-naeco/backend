import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity';

@Entity('ai_prompt_templates')
export class AiPromptTemplate extends BaseEntity {
  @Column({ name: 'template_key', type: 'text', unique: true })
  templateKey!: string;

  @Column({ name: 'template_name', type: 'text' })
  templateName!: string;

  @Column({ type: 'text' })
  purpose!: string;

  @Column({ name: 'template_text', type: 'text' })
  templateText!: string;

  @Column({ name: 'variables_json', type: 'jsonb', nullable: true })
  variablesJson!: Record<string, string> | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;
}
