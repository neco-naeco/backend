import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateExecutionsTable1764205200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'executions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'game_room_id',
            type: 'uuid',
          },
          {
            name: 'mission_id',
            type: 'uuid',
          },
          {
            name: 'turn_id',
            type: 'uuid',
          },
          {
            name: 'user_id',
            type: 'uuid',
          },
          {
            name: 'container_id',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'text',
          },
          {
            name: 'command',
            type: 'text',
          },
          {
            name: 'timeout_ms',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'stdout',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'stderr',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'exit_code',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'runtime_failure_code',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'runtime_failure_message',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'started_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'finished_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndices('executions', [
      new TableIndex({
        name: 'IDX_EXECUTIONS_GAME_ROOM_MISSION_TURN',
        columnNames: ['game_room_id', 'mission_id', 'turn_id'],
      }),
      new TableIndex({
        name: 'IDX_EXECUTIONS_GAME_ROOM_MISSION_USER',
        columnNames: ['game_room_id', 'mission_id', 'user_id'],
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('executions', 'IDX_EXECUTIONS_GAME_ROOM_MISSION_USER');
    await queryRunner.dropIndex('executions', 'IDX_EXECUTIONS_GAME_ROOM_MISSION_TURN');
    await queryRunner.dropTable('executions');
  }
}
