import { BaseEntity } from '@database/base.entity';
import { DockerImageEntity } from '@modules/docker-images/entity/docker-image.entity';
import { MissionTemplateStepEntity } from './mission-template-step.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

@Entity('mission_templates')
@Index('idx_mission_templates_difficulty', ['difficulty'])
export class MissionTemplateEntity extends BaseEntity {
  @Column({ type: 'text' })
  title!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'text' })
  language!: string;

  @Column({ type: 'text' })
  difficulty!: string;

  @Column({ type: 'integer', name: 'default_time_limit_seconds' })
  defaultTimeLimitSeconds!: number;

  @Column({ type: 'integer', name: 'default_max_strike_count' })
  defaultMaxStrikeCount!: number;

  @Column({ type: 'jsonb', name: 'judge_policy_json' })
  judgePolicyJson!: Record<string, unknown>;

  @Column({ type: 'jsonb', name: 'project_structure_json' })
  projectStructureJson!: Record<string, unknown>;

  @Column({ type: 'uuid', name: 'docker_image_id' })
  dockerImageId!: string;

  @Column({ type: 'text', name: 'success_criteria' })
  successCriteria!: string;

  @ManyToOne(() => DockerImageEntity, (dockerImage) => dockerImage.missionTemplates, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'docker_image_id' })
  dockerImage!: DockerImageEntity;

  @OneToMany(
    () => MissionTemplateStepEntity,
    (missionTemplateStep) => missionTemplateStep.missionTemplate,
  )
  steps!: MissionTemplateStepEntity[];
}
