import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGameRoomItems1779800000002 implements MigrationInterface {
  name = 'CreateGameRoomItems1779800000002';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "game_room_items" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "game_room_id" uuid NOT NULL,
        "item_type" text NOT NULL,
        "quantity" integer NOT NULL DEFAULT 1,
        "used_count" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_game_room_items_id" PRIMARY KEY ("id"),
        CONSTRAINT "fk_game_room_items_room" FOREIGN KEY ("game_room_id")
          REFERENCES "game_rooms"("id") ON DELETE CASCADE,
        CONSTRAINT "uq_game_room_items_room_type" UNIQUE ("game_room_id", "item_type"),
        CONSTRAINT "chk_game_room_items_quantity_nonnegative" CHECK ("quantity" >= 0),
        CONSTRAINT "chk_game_room_items_used_count_nonnegative" CHECK ("used_count" >= 0)
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "game_room_items"');
  }
}
