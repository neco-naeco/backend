# Local PostgreSQL persistence

Compose stores PostgreSQL 16 data in the `postgres-data` named volume
(default project name: `backend_postgres-data`). App restarts and PostgreSQL
container recreation retain the database. Redis remains an ephemeral cache.
Do not use `docker compose down -v` unless intentionally deleting the database.
A volume is not a backup; keep periodic database backups separately.

## Existing tmpfs deployments

Do not recreate or stop the tmpfs PostgreSQL container before backing it up.
Stop the app first to prevent writes. Store backups outside Git and Docker build
contexts; `.local-backups/` is excluded by both ignore files.

1. While the old database is still running, create a restricted backup directory
   and export a custom-format dump:

   ```sh
   docker compose stop app
   mkdir -p .local-backups
   chmod 700 .local-backups
   docker compose exec -T postgres sh -c \
     'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
     > .local-backups/pre-persistent-storage.dump
   ```

   Use a new filename for subsequent migrations; never overwrite the only good
   backup. Check command success and validate the dump using `pg_restore --list`.

2. Update Compose to the named-volume configuration. Create a separate temporary
   PostgreSQL service container with `docker compose run -d --no-deps --name
   neconaeco-postgres-storage-check postgres`. It must use a new/empty volume;
   never restore over an existing database without inspecting it first.
3. Wait for `pg_isready`, then restore with `docker exec -i
   neconaeco-postgres-storage-check sh -c 'pg_restore -U "$POSTGRES_USER" -d
   "$POSTGRES_DB" --exit-on-error --no-owner' < BACKUP`.
4. Compare the original and restored complete data dumps (`pg_dump --data-only
   --inserts --no-owner --no-privileges`), ignoring only the randomized
   `\restrict`/`\unrestrict` lines. Verify the schema restore completed without
   errors. If verification fails, keep the original container and backup intact;
   do not switch services.
5. Stop the temporary container before attaching its volume to the main service.
   Run `docker compose up -d --no-deps postgres`, then rebuild/start the app.
   Never run two PostgreSQL processes on the same data directory.
6. Retain the backup, verify the application, and remove only the stopped
   temporary container (without deleting volumes).

The 2026-10-10 migration followed this process. The full original/restored data
dumps matched before replacement. The original custom dump is retained locally
at `.local-backups/pre-persistent-storage.dump`.

## Game-item release verification

`tests/integration/game-item-live.test.cjs` is an opt-in **local** smoke test.
It creates UUID test users/rooms in the Compose database, tests real WebSocket
join/use/error/broadcast/resync behavior in multiplayer and practice, restarts
the app, recreates PostgreSQL, verifies persisted inventory/deadlines, and removes
its fixtures. It validates the database cluster identity before creating data.
It interrupts local gameplay; never run it against production.

```sh
ITEM_LIVE_DOCKER_TEST=1 node --test tests/integration/game-item-live.test.cjs
```

If a host PostgreSQL shadows Docker's port, use a dedicated local forwarding
port and set `ITEM_LIVE_DB_PORT`. Do not stop or modify the unrelated database.
The test uses `.env` credentials without printing them. Existing disconnect
policy still applies; storage durability does not grant LEFT participants reentry.

The smoke test seeds active game state directly; it does not test AI mission
generation or the full browser signup-to-game flow. Item allocation, migration,
transaction rollback, expiry locking and recovery are covered separately by the
isolated-schema tests documented in `tests/integration/README.md`.

## Verification completed on 2026-10-10

- Original/restored complete data dumps matched before switching storage.
- Related backend unit tests: 67 passed; backend typecheck passed.
- Isolated PostgreSQL integration tests: 25 passed.
- Live WebSocket and app/database container-recovery smoke test: passed.
- Frontend tests: 469 passed; full `npm run build` passed after adding Node typings and ES2022 config target.
- Temporary fixtures/containers were removed. App, PostgreSQL and Redis remain running; frontend remains local at port 5173.
