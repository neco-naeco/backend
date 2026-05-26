import { MigrationInterface, QueryRunner } from 'typeorm';

export class AiChatRequestsAndMessages1747843300000 implements MigrationInterface {
  name = 'AiChatRequestsAndMessages1747843300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "ai_chat_requests" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "ai_chat_session_id" uuid NOT NULL,
        "request_type" text NOT NULL,
        "source_message_id" uuid,
        "request_payload" jsonb NOT NULL,
        "response_payload" jsonb,
        "status" text NOT NULL,
        "requested_at" TIMESTAMPTZ NOT NULL,
        "responded_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ai_chat_requests" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ai_chat_requests_session_id" FOREIGN KEY ("ai_chat_session_id") REFERENCES "ai_chat_sessions"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_ai_chat_requests_session_id" ON "ai_chat_requests" ("ai_chat_session_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "ai_chat_messages" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "ai_chat_session_id" uuid NOT NULL,
        "ai_chat_request_id" uuid,
        "sender_type" text NOT NULL,
        "sender_user_id" uuid,
        "message_type" text NOT NULL,
        "content" text NOT NULL,
        "metadata_json" jsonb,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ai_chat_messages" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ai_chat_messages_session_id" FOREIGN KEY ("ai_chat_session_id") REFERENCES "ai_chat_sessions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ai_chat_messages_request_id" FOREIGN KEY ("ai_chat_request_id") REFERENCES "ai_chat_requests"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_ai_chat_messages_session_created_at" ON "ai_chat_messages" ("ai_chat_session_id", "created_at")
    `);

    await queryRunner.query(`
      ALTER TABLE "ai_chat_requests"
      ADD CONSTRAINT "FK_ai_chat_requests_source_message_id"
      FOREIGN KEY ("source_message_id") REFERENCES "ai_chat_messages"("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ai_chat_requests" DROP CONSTRAINT "FK_ai_chat_requests_source_message_id"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_ai_chat_messages_session_created_at"`);
    await queryRunner.query(`DROP TABLE "ai_chat_messages"`);
    await queryRunner.query(`DROP INDEX "IDX_ai_chat_requests_session_id"`);
    await queryRunner.query(`DROP TABLE "ai_chat_requests"`);
  }
}
