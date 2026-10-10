# Game item allocation integration test

Run from the backend root with an existing disposable PostgreSQL database:

```sh
ITEM_TEST_DATABASE_URL=postgres://USER:PASSWORD@127.0.0.1:PORT/DATABASE \
  node --test tests/integration/game-room-items.test.cjs
```

The test creates a unique schema and removes it in `finally`. It never migrates
or clears the public schema. Do not point it at production. A forced process
termination can leave its `item_test_*` schema behind.

It tests the actual item migration, database constraints, concurrent game starts,
transaction rollback after allocation, and absence of retroactive grants.
Room, participant, and item persistence use real PostgreSQL; mission/runtime and
initial-turn preparation are stubbed. It does not test item use or WebSocket delivery.

# Turn expiration locking

Using the same disposable database setup:

```sh
ITEM_TEST_DATABASE_URL=postgres://USER:PASSWORD@127.0.0.1:PORT/DATABASE \
  node --test tests/integration/turn-expiration-lock.test.cjs
```

This test observes PostgreSQL lock waits and verifies that expiration, manual
submission, and disconnect completion read committed turn state after the lock
is released. An extended turn remains active, and an already submitted turn
cannot be completed again. It does not run code execution or mission judging.

# Game item use

```sh
ITEM_TEST_DATABASE_URL=postgres://USER:PASSWORD@127.0.0.1:PORT/DATABASE \
  node --test tests/integration/game-item-use.test.cjs
```

Covers one successful consumption under concurrent requests in both modes,
exact deadline extension, inventory rollback when turn persistence fails, and
revalidation after a competing transaction changes the locked turn. Competing
completion writes are simulated directly; the actual timeout service is also
checked after extension. WebSocket publication remains outside this test.

# Item snapshot recovery

```sh
ITEM_TEST_DATABASE_URL=postgres://USER:PASSWORD@127.0.0.1:PORT/DATABASE \
  node --test tests/integration/game-item-recovery.test.cjs
```

Checks committed use without broadcasting success, authorized state recovery in
both modes, and recovery through a fresh Node process connected to the same DB.
It also verifies repeatable-read snapshot consistency during concurrent use,
finished/legacy/waiting room inventory, denied LEFT membership, and the timeout
sweeper's persisted deadline selection. It does not restart PostgreSQL. The opt-in live Docker test below covers container recreation and persistent storage.

# Live Docker smoke test

See [PostgreSQL storage and release verification](../../docs/operations/postgres-storage.md) for the opt-in live WebSocket and container-restart test, its service interruption, prerequisites, and limits.
