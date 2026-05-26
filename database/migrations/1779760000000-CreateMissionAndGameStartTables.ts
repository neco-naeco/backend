import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMissionAndGameStartTables1779760000000
  implements MigrationInterface
{
  name = 'CreateMissionAndGameStartTables1779760000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "docker_images" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "image_name" text NOT NULL,
        "image_tag" text NOT NULL,
        "image_uri" text NOT NULL,
        "registry_provider" text NOT NULL,
        "runtime_image_id" text,
        "language" text,
        "metadata_json" jsonb,
        "deprecated_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_docker_images_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "mission_templates" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "difficulty" text NOT NULL,
        "judge_policy_json" jsonb NOT NULL,
        "project_structure_json" jsonb NOT NULL,
        "docker_image_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_mission_templates_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_mission_templates_docker_image_id"
          FOREIGN KEY ("docker_image_id")
          REFERENCES "docker_images"("id")
          ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_mission_templates_difficulty"
      ON "mission_templates" ("difficulty")
    `);
    await queryRunner.query(`
      CREATE TABLE "mission_template_steps" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "mission_template_id" uuid NOT NULL,
        "step_order" integer NOT NULL,
        "target_file_path" text NOT NULL,
        "success_criteria_json" jsonb NOT NULL,
        "hint_text" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_mission_template_steps_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_mission_template_steps_template_id_step_order"
          UNIQUE ("mission_template_id", "step_order"),
        CONSTRAINT "FK_mission_template_steps_template_id"
          FOREIGN KEY ("mission_template_id")
          REFERENCES "mission_templates"("id")
          ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_mission_template_steps_template_id_step_order"
      ON "mission_template_steps" ("mission_template_id", "step_order")
    `);
    await queryRunner.query(`
      CREATE TABLE "game_room_missions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "game_room_id" uuid NOT NULL,
        "mission_template_id" uuid NOT NULL,
        "current_step_id" uuid,
        "container_id" text,
        "strike_count" integer NOT NULL,
        "judge_policy_json" jsonb NOT NULL,
        "project_structure_json" jsonb NOT NULL,
        "started_at" timestamptz,
        "finished_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_game_room_missions_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_game_room_missions_game_room_id" UNIQUE ("game_room_id"),
        CONSTRAINT "FK_game_room_missions_game_room_id"
          FOREIGN KEY ("game_room_id")
          REFERENCES "game_rooms"("id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_game_room_missions_mission_template_id"
          FOREIGN KEY ("mission_template_id")
          REFERENCES "mission_templates"("id")
          ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_game_room_missions_game_room_id"
      ON "game_room_missions" ("game_room_id")
    `);
    await queryRunner.query(`
      CREATE TABLE "game_room_mission_steps" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "game_room_mission_id" uuid NOT NULL,
        "mission_template_step_id" uuid NOT NULL,
        "step_order" integer NOT NULL,
        "status" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_game_room_mission_steps_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_game_room_mission_steps_mission_id_step_order"
          UNIQUE ("game_room_mission_id", "step_order"),
        CONSTRAINT "FK_game_room_mission_steps_mission_id"
          FOREIGN KEY ("game_room_mission_id")
          REFERENCES "game_room_missions"("id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_game_room_mission_steps_template_step_id"
          FOREIGN KEY ("mission_template_step_id")
          REFERENCES "mission_template_steps"("id")
          ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_game_room_mission_steps_mission_id_step_order"
      ON "game_room_mission_steps" ("game_room_mission_id", "step_order")
    `);
    await queryRunner.query(`
      ALTER TABLE "game_room_missions"
      ADD CONSTRAINT "FK_game_room_missions_current_step_id"
      FOREIGN KEY ("current_step_id")
      REFERENCES "game_room_mission_steps"("id")
      ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "game_room_missions"
      DROP CONSTRAINT "FK_game_room_missions_current_step_id"
    `);
    await queryRunner.query(
      'DROP INDEX "public"."idx_game_room_mission_steps_mission_id_step_order"',
    );
    await queryRunner.query('DROP TABLE "game_room_mission_steps"');
    await queryRunner.query(
      'DROP INDEX "public"."idx_game_room_missions_game_room_id"',
    );
    await queryRunner.query('DROP TABLE "game_room_missions"');
    await queryRunner.query(
      'DROP INDEX "public"."idx_mission_template_steps_template_id_step_order"',
    );
    await queryRunner.query('DROP TABLE "mission_template_steps"');
    await queryRunner.query(
      'DROP INDEX "public"."idx_mission_templates_difficulty"',
    );
    await queryRunner.query('DROP TABLE "mission_templates"');
    await queryRunner.query('DROP TABLE "docker_images"');
  }
}
