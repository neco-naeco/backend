import { MigrationInterface, QueryRunner } from 'typeorm';

export class AiPromptTemplates1747843400000 implements MigrationInterface {
  name = 'AiPromptTemplates1747843400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "ai_prompt_templates" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "template_key" text NOT NULL,
        "template_name" text NOT NULL,
        "purpose" text NOT NULL,
        "template_text" text NOT NULL,
        "variables_json" jsonb,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ai_prompt_templates" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_ai_prompt_templates_template_key" UNIQUE ("template_key")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "ai_prompt_templates"`);
  }
}
