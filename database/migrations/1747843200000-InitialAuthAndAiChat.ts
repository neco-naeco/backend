import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialAuthAndAiChat1747843200000 implements MigrationInterface {
  name = 'InitialAuthAndAiChat1747843200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "login_id" text NOT NULL,
        "nickname" text NOT NULL,
        "password_hash" text NOT NULL,
        "email" text,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_login_id" UNIQUE ("login_id"),
        CONSTRAINT "UQ_users_nickname" UNIQUE ("nickname"),
        CONSTRAINT "UQ_users_email" UNIQUE ("email")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "token_hash" text NOT NULL,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "revoked_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_refresh_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_refresh_tokens_token_hash" UNIQUE ("token_hash"),
        CONSTRAINT "FK_refresh_tokens_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_refresh_tokens_user_id" ON "refresh_tokens" ("user_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "ai_chat_sessions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "requester_user_id" uuid NOT NULL,
        "game_room_id" uuid,
        "provider_conversation_id" text,
        "provider" text NOT NULL,
        "llm_model" text NOT NULL,
        "status" text NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "closed_at" TIMESTAMPTZ,
        CONSTRAINT "PK_ai_chat_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_ai_chat_sessions_requester_user_id" UNIQUE ("requester_user_id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_ai_chat_sessions_requester_user_id" ON "ai_chat_sessions" ("requester_user_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_ai_chat_sessions_requester_user_id"`);
    await queryRunner.query(`DROP TABLE "ai_chat_sessions"`);
    await queryRunner.query(`DROP INDEX "IDX_refresh_tokens_user_id"`);
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
