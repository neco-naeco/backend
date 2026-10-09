## [2026-10-06] Practice room mode — Phase 1, Task 1: persisted mode and shared contract

**Plan reference:** `docs/plans/practice-room-mode-plan.md`

**Summary:**

- Added the shared `GameMode` enum with `MULTIPLAYER` and `PRACTICE` values.
- Persisted `game_rooms.mode` as a non-null text column that defaults to `MULTIPLAYER`, preserving existing room behavior during migration.
- Exposed the authoritative room mode from accessible-room HTTP summaries and from the existing `game-started` and `game-state-updated` realtime payloads.

**Implementation details:**

- `AddGameRoomMode1779800000000` adds `game_rooms.mode text NOT NULL DEFAULT 'MULTIPLAYER'`; its down migration drops only that column.
- `GameRoomEntity` maps the column as `GameMode`, and ordinary room creation explicitly stores `MULTIPLAYER`.
- Start, turn lifecycle, and disconnect-triggered state-update paths all provide `mode` when emitting `game-state-updated`, preventing contract gaps after the initial `game-started` event.
- Added controller and realtime/service assertions for the HTTP room summary and both initial realtime events.

**Files changed:**

- `database/migrations/1779800000000-AddGameRoomMode.ts`
- `src/shared/enums/game-room.enum.ts`
- `src/modules/game-rooms/{entity,controller,service}/`
- `src/modules/realtime/service/{realtime.interfaces,realtime-disconnect.service,realtime-event-support.service.spec}.ts`
- `src/modules/turns/service/turns.service.ts`

**Verification:**

- [x] `pnpm test -- src/modules/game-rooms/controller/game-rooms.controller.spec.ts src/modules/game-rooms/service/game-start-flow.service.spec.ts src/modules/realtime/service/realtime-event-support.service.spec.ts` — 9 tests passed.
- [x] Additional affected specs reviewed by a subagent: `turns.service.spec.ts`, `realtime-disconnect.service.spec.ts`, and `game-rooms.service.spec.ts` — 32 tests passed.
- [x] `pnpm typecheck` — passed.
- [x] Independent subagent review (GPT-5.6-sol; GPT-5.4 unavailable in this environment) — no P0–P3 findings.
- [ ] Disposable-database migration check — not run because the local Docker daemon was unavailable.
- [ ] Full `pnpm test` — unrelated pre-existing failures remain: `spec-validation.scenarios.spec.ts` constructs `TurnsService` with too few arguments, and socket gateway integration tests cannot bind a local port in this sandbox.

**Commit:**

- `5ed1633` feat(game-room): 게임방 모드 계약 추가

**Impact on next tasks:**

- Task 2 can enforce the one-person practice-room invitation invariant using the persisted `PRACTICE` mode.
- Task 3 can create an immediate-start practice room while clients identify the mode through both HTTP and realtime contracts.

**Open risks or follow-ups:**

- Apply the migration to a disposable PostgreSQL database once Docker or another local PostgreSQL environment is available, and verify a pre-existing row reads `MULTIPLAYER`.
