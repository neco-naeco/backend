import { BaseEntity } from '@database/base.entity';
import { MissionTemplateEntity } from '@modules/game-room-missions/entity/mission-template.entity';
import { Column, Entity, OneToMany } from 'typeorm';

@Entity('docker_images')
export class DockerImageEntity extends BaseEntity {
  @Column({ type: 'text', name: 'image_name' })
  imageName!: string;

  @Column({ type: 'text', name: 'image_tag' })
  imageTag!: string;

  @Column({ type: 'text', name: 'image_uri' })
  imageUri!: string;

  @Column({ type: 'text', name: 'registry_provider' })
  registryProvider!: string;

  @Column({ type: 'text', name: 'runtime_image_id', nullable: true })
  runtimeImageId!: string | null;

  @Column({ type: 'text', nullable: true })
  language!: string | null;

  @Column({ type: 'jsonb', name: 'metadata_json', nullable: true })
  metadataJson!: Record<string, unknown> | null;

  @Column({ type: 'timestamptz', name: 'deprecated_at', nullable: true })
  deprecatedAt!: Date | null;

  @OneToMany(
    () => MissionTemplateEntity,
    (missionTemplate) => missionTemplate.dockerImage,
  )
  missionTemplates!: MissionTemplateEntity[];
}
