import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGameRoomAndParticipantTables1779750000000
  implements MigrationInterface
{
  name = 'CreateGameRoomAndParticipantTables1779750000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    await queryRunner.query(`
      CREATE TABLE "game_rooms" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "owner_user_id" uuid NOT NULL,
        "status" text NOT NULL,
        "difficulty" text NOT NULL,
        "time_limit_seconds" integer NOT NULL,
        "max_strike_count" integer NOT NULL,
        "min_participants" integer NOT NULL,
        "max_participants" integer NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_game_rooms_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_game_rooms_owner_user_id_status"
      ON "game_rooms" ("owner_user_id", "status")
    `);
    await queryRunner.query(`
      CREATE TABLE "game_room_participants" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "game_room_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "role" text NOT NULL,
        "membership_status" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_game_room_participants_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_game_room_participants_game_room_id_user_id" UNIQUE ("game_room_id", "user_id"),
        CONSTRAINT "FK_game_room_participants_game_room_id"
          FOREIGN KEY ("game_room_id")
          REFERENCES "game_rooms"("id")
          ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_game_room_participants_user_id_membership_status"
      ON "game_room_participants" ("user_id", "membership_status")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_game_room_participants_game_room_id_user_id"
      ON "game_room_participants" ("game_room_id", "user_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX "public"."idx_game_room_participants_game_room_id_user_id"',
    );
    await queryRunner.query(
      'DROP INDEX "public"."idx_game_room_participants_user_id_membership_status"',
    );
    await queryRunner.query('DROP TABLE "game_room_participants"');
    await queryRunner.query(
      'DROP INDEX "public"."idx_game_rooms_owner_user_id_status"',
    );
    await queryRunner.query('DROP TABLE "game_rooms"');
  }
}
