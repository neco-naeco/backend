import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTurnsAndMissionResultsTables1764205300000
  implements MigrationInterface
{
  name = 'CreateTurnsAndMissionResultsTables1764205300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "turns" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "game_room_id" uuid NOT NULL,
        "mission_id" uuid NOT NULL,
        "player_user_id" uuid NOT NULL,
        "turn_number" integer NOT NULL,
        "status" text NOT NULL,
        "started_at" timestamptz NOT NULL,
        "deadline_at" timestamptz NOT NULL,
        "ended_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_turns_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_turns_game_room_id"
          FOREIGN KEY ("game_room_id")
          REFERENCES "game_rooms"("id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_turns_mission_id"
          FOREIGN KEY ("mission_id")
          REFERENCES "game_room_missions"("id")
          ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_turns_game_room_id_mission_id"
      ON "turns" ("game_room_id", "mission_id")
    `);
    await queryRunner.query(`
      CREATE TABLE "turn_snapshots" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "game_room_id" uuid NOT NULL,
        "turn_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "code_snapshot_json" jsonb NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_turn_snapshots_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_turn_snapshots_turn_id" UNIQUE ("turn_id"),
        CONSTRAINT "FK_turn_snapshots_game_room_id"
          FOREIGN KEY ("game_room_id")
          REFERENCES "game_rooms"("id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_turn_snapshots_turn_id"
          FOREIGN KEY ("turn_id")
          REFERENCES "turns"("id")
          ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_turn_snapshots_game_room_id_turn_id"
      ON "turn_snapshots" ("game_room_id", "turn_id")
    `);
    await queryRunner.query(`
      CREATE TABLE "mission_results" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "game_room_id" uuid NOT NULL,
        "mission_id" uuid NOT NULL,
        "turn_id" uuid NOT NULL,
        "judge_status" text NOT NULL,
        "result_payload_json" jsonb NOT NULL,
        "occurred_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_mission_results_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_mission_results_turn_id" UNIQUE ("turn_id"),
        CONSTRAINT "FK_mission_results_game_room_id"
          FOREIGN KEY ("game_room_id")
          REFERENCES "game_rooms"("id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_mission_results_mission_id"
          FOREIGN KEY ("mission_id")
          REFERENCES "game_room_missions"("id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_mission_results_turn_id"
          FOREIGN KEY ("turn_id")
          REFERENCES "turns"("id")
          ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_mission_results_game_room_id_mission_id_turn_id"
      ON "mission_results" ("game_room_id", "mission_id", "turn_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX "public"."IDX_mission_results_game_room_id_mission_id_turn_id"',
    );
    await queryRunner.query('DROP TABLE "mission_results"');
    await queryRunner.query(
      'DROP INDEX "public"."IDX_turn_snapshots_game_room_id_turn_id"',
    );
    await queryRunner.query('DROP TABLE "turn_snapshots"');
    await queryRunner.query(
      'DROP INDEX "public"."IDX_turns_game_room_id_mission_id"',
    );
    await queryRunner.query('DROP TABLE "turns"');
  }
}
