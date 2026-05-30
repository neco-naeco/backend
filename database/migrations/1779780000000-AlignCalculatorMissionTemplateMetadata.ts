import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlignCalculatorMissionTemplateMetadata1779780000000
  implements MigrationInterface
{
  name = 'AlignCalculatorMissionTemplateMetadata1779780000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "mission_templates"
      ADD COLUMN "title" text NOT NULL DEFAULT '',
      ADD COLUMN "description" text NOT NULL DEFAULT '',
      ADD COLUMN "language" text NOT NULL DEFAULT 'python',
      ADD COLUMN "default_time_limit_seconds" integer NOT NULL DEFAULT 300,
      ADD COLUMN "default_max_strike_count" integer NOT NULL DEFAULT 3,
      ADD COLUMN "success_criteria" text NOT NULL DEFAULT ''
    `);
    await queryRunner.query(`
      ALTER TABLE "mission_templates"
      ALTER COLUMN "title" DROP DEFAULT,
      ALTER COLUMN "description" DROP DEFAULT,
      ALTER COLUMN "language" DROP DEFAULT,
      ALTER COLUMN "default_time_limit_seconds" DROP DEFAULT,
      ALTER COLUMN "default_max_strike_count" DROP DEFAULT,
      ALTER COLUMN "success_criteria" DROP DEFAULT
    `);
    await queryRunner.query(`
      ALTER TABLE "mission_template_steps"
      ADD COLUMN "title" text NOT NULL DEFAULT '',
      ADD COLUMN "description" text NOT NULL DEFAULT '',
      ADD COLUMN "success_criteria" text NOT NULL DEFAULT '',
      ADD COLUMN "judge_policy_json" jsonb NOT NULL DEFAULT '{}'::jsonb
    `);
    await queryRunner.query(`
      ALTER TABLE "mission_template_steps"
      ALTER COLUMN "title" DROP DEFAULT,
      ALTER COLUMN "description" DROP DEFAULT,
      ALTER COLUMN "success_criteria" DROP DEFAULT,
      ALTER COLUMN "judge_policy_json" DROP DEFAULT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "mission_template_steps"
      DROP COLUMN "judge_policy_json",
      DROP COLUMN "success_criteria",
      DROP COLUMN "description",
      DROP COLUMN "title"
    `);
    await queryRunner.query(`
      ALTER TABLE "mission_templates"
      DROP COLUMN "success_criteria",
      DROP COLUMN "default_max_strike_count",
      DROP COLUMN "default_time_limit_seconds",
      DROP COLUMN "language",
      DROP COLUMN "description",
      DROP COLUMN "title"
    `);
  }
}
