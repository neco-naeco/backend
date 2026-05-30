import { BaseEntity } from '@database/base.entity';
import { MissionTemplateEntity } from './mission-template.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';

@Entity('mission_template_steps')
@Unique('uq_mission_template_steps_template_id_step_order', [
  'missionTemplateId',
  'stepOrder',
])
@Index('idx_mission_template_steps_template_id_step_order', [
  'missionTemplateId',
  'stepOrder',
])
export class MissionTemplateStepEntity extends BaseEntity {
  @Column({ type: 'uuid', name: 'mission_template_id' })
  missionTemplateId!: string;

  @Column({ type: 'integer', name: 'step_order' })
  stepOrder!: number;

  @Column({ type: 'text' })
  title!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'text', name: 'target_file_path' })
  targetFilePath!: string;

  @Column({ type: 'text', name: 'success_criteria' })
  successCriteria!: string;

  @Column({ type: 'jsonb', name: 'judge_policy_json' })
  judgePolicyJson!: Record<string, unknown>;

  @Column({ type: 'jsonb', name: 'success_criteria_json', select: false })
  successCriteriaJson!: Record<string, unknown>;

  @Column({ type: 'text', name: 'hint_text' })
  hintText!: string;

  @ManyToOne(
    () => MissionTemplateEntity,
    (missionTemplate) => missionTemplate.steps,
    { onDelete: 'CASCADE' },
  )
  @JoinColumn({ name: 'mission_template_id' })
  missionTemplate!: MissionTemplateEntity;
}
