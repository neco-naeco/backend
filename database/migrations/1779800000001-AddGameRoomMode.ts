import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGameRoomMode1779800000001 implements MigrationInterface {
  name = 'AddGameRoomMode1779800000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "game_rooms"
      ADD COLUMN "mode" text NOT NULL DEFAULT 'MULTIPLAYER'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "game_rooms" DROP COLUMN "mode"');
  }
}
