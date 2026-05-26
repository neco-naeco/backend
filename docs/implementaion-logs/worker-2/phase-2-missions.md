## [2026-05-26] W2-3: Implement mission template, room mission, and game-start domain services

**Plan reference:** `docs/plans/worker-2-room-participant-mission-plan.md`

**Summary:**
- Added mission-template, mission-template-step, game-room-mission, and game-room-mission-step persistence plus migration coverage for Worker 2 mission lifecycle state.
- Implemented authoritative game-start domain services that validate owner and participant constraints, create the room mission and copied step state, set the first mission step to `READY`, and move the room from `WAITING` to `IN_PROGRESS`.
- Exposed `POST /v1/game-rooms/{gameRoomId}/start` as the canonical authenticated start entry point for this worker scope, while keeping runtime container IDs server-owned rather than client-provided.

**Dependencies reviewed before starting:**
- `docs/plans/README.md`
- `docs/plans/common-sequential-plan.md`
- `docs/plans/worker-2-room-participant-mission-plan.md`
- `docs/implementaion-logs/README.md`
- `docs/implementaion-logs/common/phase-1-foundation.md`
- `docs/implementaion-logs/worker-2/phase-1-lobby.md`
- `docs/specs/00-overview.md`
- `docs/specs/02-domain-model.md`
- `docs/specs/03-modules.md`
- `docs/specs/04-data-model.md`
- `docs/specs/05-api-and-realtime.md`
- `docs/specs/06-gameplay-lifecycle.md`
- `docs/specs/07-integrations-and-ai.md`

**Implementation details:**
- Added `MissionTemplateEntity`, `MissionTemplateStepEntity`, `GameRoomMissionEntity`, and `GameRoomMissionStepEntity` with canonical snake_case columns, JSONB mission payload storage, `current_step_id`, and canonical `LOCKED` / `READY` room-step statuses.
- Added migration `1779760000000-CreateMissionAndGameStartTables.ts` for `docker_images`, `mission_templates`, `mission_template_steps`, `game_room_missions`, and `game_room_mission_steps`, including the `mission_templates.docker_image_id -> docker_images.id` foreign key and the documented `game_room_missions(game_room_id)` index.
- `GameRoomMissionsService.createMissionForGameStart()` now validates template existence, room-difficulty alignment, presence of at least one ordered template step, single-mission-per-room protection, mission metadata copying, and first-step initialization.
- `GameRoomsService.startGame()` now enforces `OWNER + JOINED` ownership, `WAITING` room status, joined-participant min/max checks, room-level advisory locking, mission creation delegation, and the final room `IN_PROGRESS` transition.
- Added `POST /v1/game-rooms/{gameRoomId}/start` in `GameRoomsController`, with UUID validation for `gameRoomId` and `missionTemplateId`, returning the started room ID, room-mission ID, status, and Seoul-time `updatedAt`.
- Added room-level advisory locking to participant mutations as well, so invite, accept, deny, leave, and start serialize against the same room lifecycle boundary rather than racing on per-user locks only.

**Files changed:**
- `database/migrations/1779760000000-CreateMissionAndGameStartTables.ts`
- `src/modules/game-room-missions/game-room-missions.module.ts`
- `src/modules/game-room-missions/entity/mission-template.entity.ts`
- `src/modules/game-room-missions/entity/mission-template-step.entity.ts`
- `src/modules/game-room-missions/entity/game-room-mission.entity.ts`
- `src/modules/game-room-missions/entity/game-room-mission-step.entity.ts`
- `src/modules/game-room-missions/service/game-room-missions.service.ts`
- `src/modules/game-room-missions/service/game-room-missions.service.spec.ts`
- `src/modules/game-rooms/controller/game-rooms.controller.ts`
- `src/modules/game-rooms/entity/game-room.entity.ts`
- `src/modules/game-rooms/game-rooms.module.ts`
- `src/modules/game-rooms/service/game-rooms.service.ts`
- `src/modules/game-rooms/service/game-rooms.service.spec.ts`
- `src/modules/game-room-participants/service/game-room-participants.service.ts`
- `src/modules/game-room-participants/service/game-room-participants.service.spec.ts`

**Verification:**
- [x] `corepack.cmd pnpm typecheck`
- [x] `corepack.cmd pnpm lint`
- [x] `.\node_modules\.bin\jest.cmd --runInBand src/modules/game-rooms/service/game-rooms.service.spec.ts src/modules/game-room-missions/service/game-room-missions.service.spec.ts src/modules/game-room-participants/service/game-room-participants.service.spec.ts`
- [x] Manual check: mission-step statuses remain the canonical `LOCKED`, `READY`, `IN_PROGRESS`, `CLEARED`, `FAILED` set from the shared enums.
- [x] Manual check: runtime container identifiers remain stored on `game_room_missions.container_id`, not in a separate ad hoc store.
- [x] `gpt-5.4` subagent review completed; missing start endpoint, room lifecycle locking gaps, public runtime-container leakage, and template-image FK issues were fixed, and the final pass reported no remaining P1-P3 findings in W2-3 scope.
- [ ] First-turn creation and realtime `game-started` / `game-state-updated` broadcasting were not implemented here because those are owned by later turn/runtime/realtime integration work (`W3-*` and shared `C4`), not by Worker 2's W2-3 acceptance boundary.

**Commit:**
- `2c36e16` feat(worker-2): implement mission lifecycle start domain

**Impact on next tasks:**
- `W2-4` can now read hint data and mission progress from stable template-step and room-mission-step persistence instead of inventing its own state model.
- Shared `C3` can call `GameRoomsService.startGame()` through a validated service boundary rather than mutating room status or mission tables directly.
- Shared `C4` and Worker 3 can layer runtime provisioning, first-turn creation, and gameplay broadcasts on top of an existing authoritative mission-start transaction.

**Design decisions made:**
- Kept template metadata (`judge_policy_json`, `project_structure_json`, `docker_image_id`) on the reusable template and copied the mutable gameplay state into `game_room_missions` so room runtime state stays isolated from template edits.
- Added room-scoped advisory locks in addition to the earlier user-scoped locks so room start cannot race lobby membership mutations.
- Kept `container_id` nullable at the domain-service layer because runtime preparation is integrated later, but removed any client-controlled `runtimeContainerId` field from the public HTTP contract to preserve server ownership of runtime identifiers.

**Deviations from spec:**
- None within W2-3 acceptance. Full first-turn creation and realtime start broadcasts remain intentionally deferred to later tasks that own turn and transport integration.

**Trade-offs:**
- Added a minimal `docker_images` persistence table in the same migration so `mission_templates.docker_image_id` can be protected by a real FK now, instead of waiting for a later runtime-focused stream and leaving template references weak in the meantime.
- Did not add turn persistence in this task even though the end-to-end gameplay lifecycle creates the first turn at game start, because Worker 2's accepted scope stops at authoritative mission and room-start domain state and the turn module is owned elsewhere.

**Open questions:**
- [x] Should the public start endpoint accept a runtime container identifier from the client? Resolved as `No`; runtime identifiers remain server-owned metadata and are not part of the HTTP request contract.
- [x] Does W2-3 need to enforce the template-to-image relationship at the DB layer already? Resolved as `Yes`; `docker_images` was added so `mission_templates.docker_image_id` can use a real FK immediately.

**Open risks or follow-ups:**
- `C4` still needs to create the first turn and emit gameplay-entry broadcasts after this authoritative mission-start transaction succeeds.
- Runtime preparation is still not wired in this worker stream, so later integration must populate `game_room_missions.container_id` from the runtime adapter instead of assuming it already exists.
- The current public start response is intentionally minimal and will likely be superseded by broader gameplay-entry state once shared turn/realtime integration lands.

**Instructions for the next worker:**
- Read this file before starting `W2-4` or shared `C3`/`C4`, and treat `GameRoomsService.startGame()` plus `GameRoomMissionsService.createMissionForGameStart()` as the only authoritative path for mission-start persistence.
- Preserve the room-level advisory lock when adding any new mutation that changes lobby membership or room-start readiness.
- Use `game_room_mission_steps` as the live step-state source of truth and `mission_template_steps.hint_text` as the hint-text source until AI-generated hints are intentionally introduced.
- Do not move `container_id` into controller-managed or client-managed state; later runtime integration must fill it from the server-owned adapter layer.

## [2026-05-26] W2-4: Implement hint retrieval and mission completion state transitions

**Plan reference:** `docs/plans/worker-2-room-participant-mission-plan.md`

**Summary:**
- Added the authenticated hint API `GET /v1/game-room-missions/{missionId}/hints?scope=current-step` backed by the current room-mission step and `mission_template_steps.hint_text`.
- Extended `GameRoomMissionsService` with reusable mission-step lifecycle helpers for `READY -> IN_PROGRESS`, step clear progression, strike accumulation, and strike-limit termination.
- Kept Worker 2 scoped to authoritative room-mission state only, so final room-state finish and mission-result persistence remain available for shared `C4` without changing the canonical hint contract.

**Dependencies reviewed before starting:**
- `docs/plans/README.md`
- `docs/plans/common-sequential-plan.md`
- `docs/plans/worker-2-room-participant-mission-plan.md`
- `docs/implementaion-logs/README.md`
- `docs/implementaion-logs/common/phase-1-foundation.md`
- `docs/implementaion-logs/worker-2/phase-1-lobby.md`
- `docs/implementaion-logs/worker-2/phase-2-missions.md`
- `docs/specs/00-overview.md`
- `docs/specs/02-domain-model.md`
- `docs/specs/03-modules.md`
- `docs/specs/04-data-model.md`
- `docs/specs/05-api-and-realtime.md`
- `docs/specs/06-gameplay-lifecycle.md`
- `docs/specs/07-integrations-and-ai.md`
- `docs/specs/08-security-testing-and-delivery.md`

**Implementation details:**
- Added `GameRoomMissionsController` and registered it in `GameRoomMissionsModule` with `AuthenticatedRequestGuard`, exposing the canonical hint endpoint and rejecting unsupported hint scopes with an explicit `MISSION_HINT_SCOPE_INVALID` error.
- `GameRoomMissionsService.getCurrentStepHint()` now loads the room mission, verifies the caller has `JOINED` membership in the owning room, and returns the current step metadata plus `hintText` from `mission_template_steps`.
- Added explicit step-transition guards in `GameRoomMissionsService` so mission-step status changes stay within the canonical `LOCKED`, `READY`, `IN_PROGRESS`, `CLEARED`, `FAILED` lifecycle rather than letting downstream turn logic set arbitrary states.
- Added `transitionCurrentStepToInProgress()`, `completeCurrentStep()`, and `recordFailedAttempt()` helper methods so shared `C4` can advance steps, unlock the next step, increment strikes, and terminate the mission at the strike limit without inventing a second mission-state transition path.
- Mission completion helpers update `game_room_missions.current_step_id`, `strike_count`, and `finished_at`, but intentionally do not change `game_rooms.status`; final room finish remains the responsibility of shared integration when mission results and broadcasts are wired together.

**Files changed:**
- `src/modules/game-room-missions/controller/game-room-missions.controller.ts`
- `src/modules/game-room-missions/game-room-missions.module.ts`
- `src/modules/game-room-missions/service/game-room-missions.service.ts`
- `src/modules/game-room-missions/service/game-room-missions.service.spec.ts`

**Verification:**
- [x] `corepack.cmd pnpm typecheck`
- [x] `corepack.cmd pnpm lint`
- [x] `.\node_modules\.bin\jest.cmd --runInBand src/modules/game-room-missions/service/game-room-missions.service.spec.ts`
- [x] Manual check: hint retrieval uses `mission_template_steps.hint_text` as the primary source, matching `docs/specs/07-integrations-and-ai.md`.
- [x] Manual check: helper methods keep mission-step statuses inside the canonical `LOCKED`, `READY`, `IN_PROGRESS`, `CLEARED`, `FAILED` set and leave final room completion for shared `C4`.
- [x] `gpt-5.4` subagent review completed; final review reported no meaningful defects or contract regressions in W2-4 scope.
- [ ] End-to-end HTTP verification of `GET /v1/game-room-missions/{missionId}/hints` was not run because the repository still lacks a DB-backed authenticated integration harness that can seed room missions and memberships for controller-level tests.

**Commit:**
- `79b8fa5` feat(worker-2): add mission hints and completion helpers

**Impact on next tasks:**
- Shared `C4` can reuse `GameRoomMissionsService` helpers instead of embedding step-clear, strike, and mission-finish mutations in turn or realtime code.
- Worker 3 and shared integration now have a canonical server-owned hint endpoint for gameplay entry and in-game hint lookup without depending on AI-generated hint text.
- Mission lifecycle authority stays centralized in Worker 2 services, reducing the chance that turn evaluation or broadcast code drifts from the persisted step-state rules.

**Design decisions made:**
- Kept hint reads authorized by active `JOINED` membership in the owning room rather than by mission ID alone, matching the service-layer authorization rule from `docs/specs/08-security-testing-and-delivery.md`.
- Chose explicit service helpers over a generic public `setStatus()` API so downstream work cannot bypass transition validation accidentally.
- Left `game_rooms.status = FINISHED` out of W2-4 helper methods because Worker 2 owns room-mission state here, while mission-result persistence, final broadcasts, and room finish sequencing are integrated later in shared `C4`.

**Deviations from spec:**
- None within W2-4 acceptance. AI-generated hints, mission-result persistence, and final room-status finish remain intentionally deferred to later tasks that own those broader integrations.

**Trade-offs:**
- Returned a single current-step hint payload instead of adding speculative multi-hint shapes because MVP hint policy names `mission_template_step.hint_text` as the source of truth and the contract only requires `scope=current-step`.
- Did not add controller-level or DB-backed integration tests in this task because the existing repository verification surface is still unit-test-first for Worker 2 and the authenticated seeded mission flow is not yet scaffolded for E2E coverage.

**Open questions:**
- [x] Should the hint API wait for AI-generated hints before exposing gameplay hints? Resolved as `No`; MVP hint reads come from `mission_template_steps.hint_text` first.
- [x] Should W2-4 helper methods also finalize `game_rooms.status`? Resolved as `No`; they only finalize room-mission state, and shared `C4` must sequence final room status with mission results and broadcasts.

**Open risks or follow-ups:**
- Shared `C4` must still persist `mission_results`, set `game_rooms.status = FINISHED`, and emit final gameplay broadcasts after these room-mission helpers run.
- If a future contract adds spectator or reconnect semantics, `JOINED`-only hint access may need to be widened deliberately rather than changed ad hoc.
- A later DB-backed integration test should exercise the hint endpoint and mission-step helper behavior against real persistence, especially around `current_step_id` updates and strike-limit finish.

**Instructions for the next worker:**
- Use `GameRoomMissionsService.transitionCurrentStepToInProgress()`, `completeCurrentStep()`, and `recordFailedAttempt()` as the only mission-step mutation path when wiring turn evaluation in `C4`.
- Preserve `mission_template_steps.hint_text` as the primary hint contract until specs explicitly promote AI-generated hints to first-class API data.
- When `C4` finishes a mission, update `game_rooms.status` and final broadcasts around these helpers rather than moving room-finish responsibility back into controllers or gateways.
