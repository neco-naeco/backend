import { BaseEntity } from '@database/base.entity';
import { MissionTemplateStepEntity } from './mission-template-step.entity';
import { Column, Entity, Index, OneToMany } from 'typeorm';

@Entity('mission_templates')
@Index('idx_mission_templates_difficulty', ['difficulty'])
export class MissionTemplateEntity extends BaseEntity {
  @Column({ type: 'text' })
  difficulty!: string;

  @Column({ type: 'jsonb', name: 'judge_policy_json' })
  judgePolicyJson!: Record<string, unknown>;

  @Column({ type: 'jsonb', name: 'project_structure_json' })
  projectStructureJson!: Record<string, unknown>;

  @Column({ type: 'uuid', name: 'docker_image_id' })
  dockerImageId!: string;

  @OneToMany(
    () => MissionTemplateStepEntity,
    (missionTemplateStep) => missionTemplateStep.missionTemplate,
  )
  steps!: MissionTemplateStepEntity[];
}
