## [2026-05-26] C3: Integrate AI chat commands with room lifecycle

**Plan reference:** `docs/plans/common-sequential-plan.md`

**Summary:**
- Connected `AiChatSessionsService` command execution to authoritative Worker 2 room, participant, and mission services for `ROOM_CREATE`, `USER_INVITE`, `ROOM_JOIN`, `USER_INVITE_DENY`, and `GAME_START`.
- Kept ambiguous or unsupported AI parsing non-authoritative, and converted command execution failures into `FAILED` chat results without silently mutating state outside validated service paths.
- Addressed post-implementation `gpt-5.4` review findings by making invite execution transactional as a batch, restricting owner-room fallback to `WAITING` rooms, and validating mission templates before room creation.

**Dependencies reviewed before starting:**
- `docs/implementaion-logs/README.md`
- `docs/implementaion-logs/common/phase-1-foundation.md`
- `docs/implementaion-logs/worker-1/phase-2-intent-parsing.md`
- `docs/implementaion-logs/worker-2/phase-1-lobby.md`
- `docs/implementaion-logs/worker-2/phase-2-missions.md`
- `docs/implementaion-logs/worker-3/phase-1-realtime.md`
- `docs/plans/README.md`
- `docs/plans/common-sequential-plan.md`
- `docs/specs/03-modules.md`
- `docs/specs/05-api-and-realtime.md`
- `docs/specs/06-gameplay-lifecycle.md`
- `docs/specs/08-security-testing-and-delivery.md`

**Implementation details:**
- `AiChatSessionsService` now resolves validated `AiChatCommandDto` values into real service calls instead of always returning `PENDING`. Successful command execution persists `SUCCESS` `commandResult` values and updates `ai_chat_sessions.game_room_id` when the room context changes.
- `ROOM_CREATE` remains `PENDING` until both difficulty and mission template are present. Once both exist, `GameRoomMissionsService.validateMissionTemplateSelection()` runs before `GameRoomsService.createRoom()` so invalid template selections do not create `WAITING` rooms.
- `USER_INVITE` now resolves invitee nicknames to user IDs and calls the new `GameRoomParticipantsService.inviteParticipants()` batch path so all invitations run inside one transaction rather than partially persisting on mid-loop failure.
- `ROOM_JOIN` and `USER_INVITE_DENY` now resolve invitation context from explicit `participantId`, explicit `gameRoomId`, or the latest invited membership and then call Worker 2 acceptance or denial services only.
- `GAME_START` now resolves the selected mission template from the latest successful room-creation request for the same room and then calls `GameRoomsService.startGame()` through the same service-layer validation used by the HTTP API.
- Fallback room resolution for owner-driven commands now only targets `OWNER + JOINED` membership on `WAITING` rooms, avoiding accidental selection of `IN_PROGRESS` rooms when both statuses exist for the same user.
- `AiChatCommandResultMapper` gained `SUCCESS` and detail-aware `FAILED` mapping helpers so chat responses can reflect the authoritative API path, resolved room ID, participant summary, and `started` state after execution.

**Files changed:**
- `src/modules/ai-chat-sessions/ai-chat-sessions.module.ts`
- `src/modules/ai-chat-sessions/ai-chat-sessions.service.ts`
- `src/modules/ai-chat-sessions/ai-chat-sessions.service.spec.ts`
- `src/modules/ai-chat-sessions/constants/ai-chat-error.constants.ts`
- `src/modules/ai-chat-sessions/intent/ai-chat-command-result.mapper.ts`
- `src/modules/game-room-participants/service/game-room-participants.service.ts`
- `src/modules/game-room-participants/service/game-room-participants.service.spec.ts`
- `src/modules/game-room-missions/service/game-room-missions.service.ts`
- `src/modules/game-room-missions/service/game-room-missions.service.spec.ts`

**Verification:**
- [x] `corepack.cmd pnpm typecheck`
- [x] `.\node_modules\.bin\jest.cmd --runInBand src/modules/ai-chat-sessions/ai-chat-sessions.service.spec.ts src/modules/ai-chat-sessions/intent/ai-chat-command-result.mapper.spec.ts src/modules/game-room-participants/service/game-room-participants.service.spec.ts src/modules/game-room-missions/service/game-room-missions.service.spec.ts`
- [x] `corepack.cmd pnpm lint`
- [x] `corepack.cmd pnpm build`
- [x] `gpt-5.4` review subagent run before and after fixes; initial findings on partial invite persistence, wrong owner-room fallback, and pre-validation room creation were fixed, and re-review reported no remaining findings.
- [ ] DB-backed integration tests were not run because the repository still lacks authenticated Postgres integration wiring for AI chat plus lobby flows.

**Commit:**
- `6bcae3a` feat(common): integrate ai chat commands with room lifecycle

**Impact on next tasks:**
- `C4` can assume AI-chat-driven room creation, invitation, acceptance, denial, and game-start preparation now traverse the same authoritative Worker 2 services as direct HTTP flows.
- Worker 3 or shared integration can emit realtime state changes on top of authoritative room mutations without inventing a second room-lifecycle path in the gateway layer.
- AI chat history now carries enough execution result metadata for the client to distinguish `PENDING`, `SUCCESS`, and `FAILED` command outcomes without bypassing service authority.

**Design decisions made:**
- Chose to keep command execution inside `AiChatSessionsService` orchestration rather than adding controller-level shortcuts so the AI chat module remains the integration seam while room-state authority stays in Worker 2 services.
- Added batch invitation support to Worker 2 instead of compensating in Worker 1 because atomic invitation behavior is a room-membership invariant, not an AI-only concern.
- Reused prior successful `ROOM_CREATE` request history to resolve the selected mission template for `GAME_START` rather than introducing a new session-local mutable store.

**Deviations from spec:**
- None intended. The implementation preserves the spec rule that invalid or ambiguous AI commands must not create authoritative room state.

**Trade-offs:**
- `GAME_START` currently derives the chosen template from prior successful chat history for the same room. This keeps the change local for C3, but a later explicit room-level persisted selection field may simplify C4 or direct HTTP start flows.
- Verification is still unit-test heavy because the repository does not yet provide a seeded authenticated integration harness for AI chat plus room mutations.

**Open questions:**
- [x] Can partial `USER_INVITE` execution leave authoritative state behind on a failed AI chat command? -> No. `inviteParticipants()` now batches the mutation in one transaction.
- [x] Can owner-room fallback select an `IN_PROGRESS` room when the user also owns a `WAITING` room? -> No. Fallback now filters to `WAITING` only.
- [x] Can `ROOM_CREATE` create a room before mission template validity is known? -> No. Template validation now runs before room creation.

**Open risks or follow-ups:**
- `GAME_START` still does not create the first turn or emit `game-started`; that remains `C4` scope with Worker 3 integration.
- Realtime participant broadcasts are still not triggered from these room-state service calls; shared integration must wire that sequencing deliberately instead of assuming C3 already broadcasts.
- A future DB-backed integration test should cover multi-invite rollback and `ROOM_CREATE -> GAME_START` template-selection continuity against real Postgres transactions.

**Instructions for the next worker:**
- Start `C4` from this log and preserve `AiChatSessionsService -> Worker 2 service` authority boundaries. Do not reintroduce direct repository mutation from AI chat code.
- If you need room-start context beyond `gameRoomId`, read the latest successful `ROOM_CREATE` request history first or promote that state into explicit persistence through the shared track.
- Keep invitation mutation paths batch-safe; any future multi-user lobby change should preserve single-transaction behavior for the whole command.

## [2026-05-26] C4: Connect game start, turn progression, and mission-result flow

**Plan reference:** `docs/plans/common-sequential-plan.md`

**Summary:**
- Connected authoritative game start to first-turn creation and realtime `game-started` / `game-state-updated` broadcasts through a dedicated `GameStartFlowService`.
- Implemented durable turn lifecycle persistence for submit and timeout: `turns`, `turn_snapshots`, `executions`, and `mission_results`, plus next-turn progression and final mission completion handling.
- Addressed post-implementation `gpt-5.4` review findings by stopping `ERROR` judgments from silently advancing to the next turn, reseeding file buffers on both `game-started` and `turn-changed`, restoring event payload shapes to the documented contract, and adding a server-side timeout sweep service.

**Dependencies reviewed before starting:**
- `docs/implementaion-logs/README.md`
- `docs/implementaion-logs/common/phase-2-integration.md`
- `docs/implementaion-logs/worker-2/phase-2-missions.md`
- `docs/implementaion-logs/worker-3/phase-1-realtime.md`
- `docs/implementaion-logs/worker-3/phase-2-runtime.md`
- `docs/plans/README.md`
- `docs/plans/common-sequential-plan.md`
- `docs/specs/00-overview.md`
- `docs/specs/04-data-model.md`
- `docs/specs/05-api-and-realtime.md`
- `docs/specs/06-gameplay-lifecycle.md`
- `docs/specs/07-integrations-and-ai.md`
- `docs/specs/08-security-testing-and-delivery.md`

**Implementation details:**
- Added persistent `TurnEntity`, `TurnSnapshotEntity`, and `MissionResultEntity` plus migration `1764205300000-CreateTurnsAndMissionResultsTables.ts` so turn ownership, end-of-turn snapshots, execution outcomes, and judge results now survive realtime boundaries.
- `GameRoomsService.startGame()` now creates the first turn and transitions the first mission step into active play inside the same authoritative room-start transaction. `GameStartFlowService` wraps that result into canonical `game-started` and `game-state-updated` broadcasts with initial `fileUrl` metadata for editor bootstrapping.
- `TurnsService` now owns turn-end orchestration for manual submit and timeout: lock the turn, persist the snapshot, record execution, derive `PASSED | FAILED | ERROR`, update mission or room state, create the next turn when allowed, and return canonical realtime payloads.
- Runtime container absence is now explicit instead of implicit corruption. `ExecutionsService` records `RUNTIME_CONTAINER_UNAVAILABLE`, and the `ERROR` branch keeps the room in an explicit no-next-turn state until an operator or later task resolves the runtime condition.
- Realtime submit sequencing moved into `DefaultRealtimeTurnSubmitService`, which now publishes `turn-submit -> turn-evaluated -> turn-changed? -> mission-result? -> game-state-updated` in contract order instead of emitting the transition state too early.
- `RealtimeEventSupportService` now seeds initial file buffers on both `game-started` and `turn-changed`, so the next player can submit without first editing and still produce a non-empty snapshot. `RealtimeTurnTimeoutService` performs a server-side sweep of expired `IN_PROGRESS` turns and routes them through the same timeout lifecycle.
- AI-chat-driven `GAME_START` now goes through `GameStartFlowService`, so chat-started games and direct HTTP starts share the same turn initialization and realtime side effects.

**Files changed:**
- `database/migrations/1764205300000-CreateTurnsAndMissionResultsTables.ts`
- `src/app.module.ts`
- `src/modules/ai-chat-sessions/ai-chat-sessions.service.ts`
- `src/modules/ai-chat-sessions/ai-chat-sessions.service.spec.ts`
- `src/modules/executions/service/executions.service.ts`
- `src/modules/game-rooms/controller/game-rooms.controller.ts`
- `src/modules/game-rooms/game-rooms.module.ts`
- `src/modules/game-rooms/service/game-rooms.service.ts`
- `src/modules/game-rooms/service/game-rooms.service.spec.ts`
- `src/modules/game-rooms/service/game-start-flow.service.ts`
- `src/modules/game-rooms/service/game-start-flow.service.spec.ts`
- `src/modules/mission-results/mission-results.module.ts`
- `src/modules/mission-results/entity/mission-result.entity.ts`
- `src/modules/mission-results/service/mission-results.service.ts`
- `src/modules/realtime/gateway/realtime.gateway.ts`
- `src/modules/realtime/gateway/realtime.gateway.spec.ts`
- `src/modules/realtime/gateway/realtime.gateway.unit.spec.ts`
- `src/modules/realtime/realtime.module.ts`
- `src/modules/realtime/service/realtime-defaults.service.ts`
- `src/modules/realtime/service/realtime-event-support.service.ts`
- `src/modules/realtime/service/realtime-event-support.service.spec.ts`
- `src/modules/realtime/service/realtime.interfaces.ts`
- `src/modules/realtime/service/realtime-turn-timeout.service.ts`
- `src/modules/realtime/service/realtime-turn-timeout.service.spec.ts`
- `src/modules/turns/turns.module.ts`
- `src/modules/turns/entity/turn.entity.ts`
- `src/modules/turns/entity/turn-snapshot.entity.ts`
- `src/modules/turns/service/turns.service.ts`
- `src/modules/turns/service/turns.service.spec.ts`
- `src/shared/enums/mission.enum.ts`

**Verification:**
- [x] `./node_modules/.bin/jest --runInBand src/modules/game-rooms/service/game-rooms.service.spec.ts src/modules/game-rooms/service/game-start-flow.service.spec.ts src/modules/turns/service/turns.service.spec.ts src/modules/realtime/service/realtime-event-support.service.spec.ts src/modules/realtime/service/realtime-turn-timeout.service.spec.ts src/modules/realtime/gateway/realtime.gateway.unit.spec.ts src/modules/ai-chat-sessions/ai-chat-sessions.service.spec.ts`
- [x] `gpt-5.4` review subagent run twice. Initial findings on error-path advancement, no-edit submit buffers, event order, payload shape, and missing timeout orchestration were all fixed. Final re-review reported no remaining high-severity findings in scope.
- [ ] `./node_modules/.bin/tsc --noEmit` could not be used as a clean repository-wide signal because this workspace currently reports unrelated `@nestjs/jwt` resolution failures before reaching the new C4 files.
- [ ] `src/modules/realtime/gateway/realtime.gateway.spec.ts` could not be executed in this sandbox because the environment blocks socket binding with `listen EPERM: operation not permitted 0.0.0.0`.

**Commit:**
- `acdf7af` feat(common): 게임 진행 파이프라인 연결

**Impact on next tasks:**
- `C5` can now harden authorization, duplicate submit handling, reconnect cleanup, and timeout edge cases on top of a real submit/timeout pipeline instead of placeholder hooks.
- Worker 3 follow-up work can assume canonical realtime payloads exist for `game-started`, `turn-evaluated`, `turn-changed`, `game-state-updated`, and `mission-result`, including seeded file buffers for no-edit submits.
- Any future runtime or scheduler refinement must preserve the explicit `ERROR` branch behavior and the single authoritative turn lifecycle in `TurnsService`.

**Design decisions made:**
- Kept room-start state authority in `GameRoomsService`, but moved cross-cutting broadcast composition into `GameStartFlowService` so HTTP and AI-chat starts share one side-effect path without stuffing realtime concerns into the controller.
- Chose data URLs for initial `fileUrl` payloads so the game-start contract can be satisfied immediately without introducing a new file-download endpoint in the same task.
- Implemented timeout orchestration as a realtime-side sweep service instead of a separate queue or cron worker to keep the change local to the current NestJS process while satisfying the “server detects deadline” requirement.

**Deviations from spec:**
- The sandbox prevented running the full socket-bound integration spec, so websocket verification remains unit-level here even though the emitted event names and payload keys were aligned to `docs/specs/05-api-and-realtime.md`.

**Trade-offs:**
- `RealtimeTurnTimeoutService` currently uses a simple one-second in-process sweep. That is sufficient for MVP authority and keeps the diff local, but multi-instance or high-scale deployments will want a stronger distributed scheduling mechanism later.
- Initial editor file loading uses inline `data:` URLs backed by mission structure or latest snapshot content. This keeps C4 self-contained, but a later dedicated file-serving endpoint may be preferable if mission files become large.

**Open questions:**
- [x] Should runtime or processing errors silently move the game to the next player? -> No. `ERROR` outcomes now remain explicit and stop before next-turn creation.
- [x] Can a next player submit without editing and still get the last authoritative snapshot? -> Yes. Buffers are reseeded on `game-started` and `turn-changed`.
- [x] Is server-driven timeout orchestration actually wired anywhere? -> Yes. `RealtimeTurnTimeoutService` sweeps expired turns and routes them through `timeoutTurn()`.

**Open risks or follow-ups:**
- Full websocket integration coverage still needs an environment that permits binding a listening socket, so CI or a developer machine should run `src/modules/realtime/gateway/realtime.gateway.spec.ts`.
- Runtime preparation still records explicit container-unavailable errors when no mission container exists. If a later task adds real mission-container provisioning, it must preserve the same explicit execution and judge-state behavior on failure.

**Instructions for the next worker:**
- Start `C5` from `TurnsService`, `RealtimeTurnTimeoutService`, and `RealtimeEventSupportService`. Preserve the single authoritative turn-end pipeline instead of adding side paths for submit, timeout, or disconnect cleanup.
- When tightening authorization or duplicate-submit handling, keep the server-time authority rule and do not reintroduce client-timestamp trust for turn completion.
- If you need to change event payloads, check `docs/specs/05-api-and-realtime.md` first and update both `turns.service.ts` and the realtime support tests together.

---

## [2026-05-30] Task 3: Prepare the room-mission container from the seeded Docker image

**Plan reference:** `docs/plans/calculator-mission-template-runtime-judging-plan.md`

**Summary:**
- 게임 시작 시 미션 템플릿의 `docker_image_id`를 `DockerImageEntity`로 조회하고, 시드된 `imageUri`로 room-mission 런타임 컨테이너를 준비한 뒤 `game_room_missions.container_id`에 저장했습니다.
- 런타임 준비 실패는 `RUNTIME_CONTAINER_PREPARATION_FAILED`로 명시적으로 반환하며, 클라이언트에는 고정 도메인 메시지만 노출합니다.
- 컨테이너 생성 후 미션/턴/start flow 실패 및 transaction commit 실패 시 `removeMissionContainer` 기반 best-effort cleanup을 수행합니다.

**Dependencies reviewed before starting:**
- `docs/plans/calculator-mission-template-runtime-judging-plan.md` — Task 3 acceptance criteria
- `docs/implementaion-logs/README.md` — logging contract
- `docs/implementaion-logs/common/phase-1-foundation.md` — Task 1 and Task 2 handoff
- `docs/specs/07-integrations-and-ai.md` — Confirmed Docker Model and game-start container lifecycle
- `docs/specs/06-gameplay-lifecycle.md` — game start authority boundary

**Implementation details:**
- `GameRoomMissionsService.createMissionForGameStart()`는 미션 ID를 선할당한 뒤 `RuntimeAdapter.prepareMissionContainer()`를 호출하고, 성공 시에만 미션/스텝 레코드를 저장합니다.
- `validateMissionTemplateSelection()`은 `dockerImage` relation을 함께 로드하며, 누락 시 `MISSION_TEMPLATE_DOCKER_IMAGE_NOT_FOUND`를 반환합니다.
- `DockerRuntimeAdapter.removeMissionContainer()`를 추가해 `docker rm -f`로 준비된 컨테이너를 정리합니다.
- `GameRoomMissionsService.releasePreparedRuntimeContainer()`는 cleanup 실패를 warn 로그로만 남기고 start flow 예외 전파를 막지 않습니다.
- `GameRoomsService.startGame()`은 `preparedRuntimeContainerId`를 transaction 바깥에서 추적하고, transaction promise reject(commit 포함) 시에도 cleanup이 실행되도록 바깥 `try/catch`로 감쌌습니다. transaction이 성공적으로 resolve된 뒤에만 cleanup 대상 ID를 해제합니다.
- 클라이언트가 주입하던 `runtimeContainerId` 경로는 제거했습니다. 컨테이너 ID는 서버 런타임 어댑터만 소유합니다.

**Files changed:**
- `src/integrations/runtime/runtime.interfaces.ts`
- `src/integrations/runtime/runtime-defaults.service.ts`
- `src/integrations/runtime/runtime-defaults.service.spec.ts`
- `src/modules/game-room-missions/game-room-missions.module.ts`
- `src/modules/game-room-missions/service/game-room-missions.service.ts`
- `src/modules/game-room-missions/service/game-room-missions.service.spec.ts`
- `src/modules/game-rooms/service/game-rooms.service.ts`
- `src/modules/game-rooms/service/game-rooms.service.spec.ts`
- `src/test/scenarios/spec-validation.scenarios.spec.ts`
- `docs/implementaion-logs/common/phase-2-integration.md`

**Verification:**
- [x] `pnpm test -- src/modules/game-rooms/service/game-rooms.service.spec.ts`
- [x] `pnpm test -- src/modules/game-room-missions/service/game-room-missions.service.spec.ts`
- [x] `pnpm test -- src/integrations/runtime/runtime-defaults.service.spec.ts`
- [x] `pnpm typecheck`
- [x] Manual check: game-start container lifecycle가 `docs/specs/07-integrations-and-ai.md`의 prepare-at-start / store `container_id` 흐름과 일치함
- [x] Subagent review 3회 반영 — orphan cleanup, 고정 오류 메시지, transaction commit 실패 cleanup; 최종 피드백 없음

**Commit:**
- feat(runtime): 게임 시작 시 미션 런타임 컨테이너 준비

**Impact on next tasks:**
- Task 4 can execute stdin-driven cases against `game_room_missions.container_id` without inventing a second container-preparation path.
- Task 5 judging should assume the active room-mission container already exists at game start and treat missing containers as explicit runtime errors only when preparation was skipped or cleanup removed it.

**Design decisions made:**
- Container preparation stays inside `GameRoomMissionsService` while Docker invocation remains in `integrations/runtime`, preserving execution-only runtime boundaries from the plan.
- Cleanup is best-effort rather than blocking rollback completion. A failed `docker rm -f` is logged but does not mask the original start failure.
- Transaction commit failure cleanup uses an outer `try/catch` around `dataSource.transaction()` because TypeORM rejects the transaction promise after callback success when commit fails, which inner callback catches cannot observe.

**Deviations from spec:**
- None intended. Runtime preparation does not perform judging or mutate strike/step state.

**Trade-offs:**
- Docker container creation runs while the game-start DB transaction is open. This keeps mission/container pairing simple but can hold advisory locks slightly longer and may leave a short-lived orphan if cleanup itself fails.
- Commit-failure regression is simulated by mocking `dataSource.transaction()` to throw after callback success, not by driving a real Postgres commit failure in CI.

**Open questions:**
- [x] Should clients supply `runtimeContainerId` on game start? → No. Server-owned container preparation only.
- [x] Should Docker stderr be returned in `RUNTIME_CONTAINER_PREPARATION_FAILED.message`? → No. Fixed client message plus internal error logging only.
- [x] Should cleanup run when transaction commit fails after callback success? → Yes. Outer transaction `try/catch` tracks `preparedRuntimeContainerId` until the transaction promise resolves.

**Open risks or follow-ups:**
- If `removeMissionContainer` repeatedly fails, orphaned containers may still accumulate and need operational cleanup tooling outside this task.
- Task 4 should not change container ownership; extend execution input only.

**Instructions for the next worker:**
- Read `database/seeds/docker_images.json` and the Task 2 log before extending runtime execution for stdin.
- Reuse `game_room_missions.container_id` from the live mission; do not prepare a second container per turn.
- Preserve `releasePreparedRuntimeContainer()` semantics when touching game start; any new failure path after container preparation must participate in the same cleanup contract.

## [2026-05-30] Task 4: Extend runtime execution to support stdin-driven console cases

**Plan reference:** `docs/plans/calculator-mission-template-runtime-judging-plan.md`

**Summary:**
- `stdinLines`를 newline으로 결합한 stdin 페이로드(`formatStdinFromLines`)를 런타임 실행 계약에 추가했습니다.
- `DockerRuntimeAdapter.executeMissionCode()`는 stdin이 있을 때만 `docker exec -i`로 프로세스에 stdin을 전달하고, 없으면 기존 비대화형 `docker exec` 경로를 유지합니다.
- `ExecutionsService.executeTurnCode()`가 `stdinLines`를 런타임 어댑터까지 전달하며, stdout·stderr·exit code·runtime failure 메타데이터 저장 동작은 그대로입니다.

**Dependencies reviewed before starting:**
- `docs/plans/calculator-mission-template-runtime-judging-plan.md` — Task 4 acceptance criteria
- `docs/implementaion-logs/README.md` — logging contract
- `docs/implementaion-logs/common/phase-2-integration.md` — Task 3 handoff
- `docs/implementaion-logs/common/phase-1-foundation.md` — `judgePolicyJson.steps[].testCases[].stdinLines` seed contract
- `docs/specs/07-integrations-and-ai.md` — execution-only runtime boundary

**Implementation details:**
- `ExecuteMissionCodeInput.stdinLines`와 `formatStdinFromLines()`를 `runtime.interfaces.ts`에 정의해 calculator 시드의 line-by-line `input()` 흐름과 맞췄습니다.
- 파일 주입(write)은 기존처럼 `docker exec -i` + content stdin을 사용하고, 프로세스 실행 단계에서만 testcase stdin을 추가로 전달합니다.
- `ExecutionsService.StartExecutionInput.stdinLines`를 `executeMissionCode()`에 그대로 포워딩해 Task 5 judge helper가 동일 room-mission 컨테이너에서 case별 stdin 실행을 호출할 수 있게 했습니다.
- 판정(`PASSED`/`FAILED`/`ERROR`)이나 strike/step 전이는 이 task 범위 밖이며, 런타임은 실행 결과만 반환합니다.

**Files changed:**
- `src/integrations/runtime/runtime.interfaces.ts`
- `src/integrations/runtime/runtime-defaults.service.ts`
- `src/integrations/runtime/runtime-defaults.service.spec.ts`
- `src/modules/executions/service/executions.service.ts`
- `src/modules/executions/service/executions.service.spec.ts`
- `docs/implementaion-logs/common/phase-2-integration.md`

**Verification:**
- [x] `pnpm test -- src/integrations/runtime/runtime-defaults.service.spec.ts`
- [x] `pnpm test -- src/modules/executions/service/executions.service.spec.ts`
- [x] `pnpm typecheck`
- [x] Subagent review — 구현 결함 없음 확인

**Commit:**
- `391fc1c` feat(runtime): stdin 기반 콘솔 실행 지원

**Impact on next tasks:**
- Task 5 can call `ExecutionsService.executeTurnCode({ stdinLines })` per public case inside the existing `game_room_missions.container_id` without a second container-preparation path.
- Task 5 should compare `stdout.trim()` to `expectedStdout`, require empty stderr and exit code 0 for pass, and keep all case comparison logic outside `integrations/runtime`.

**Design decisions made:**
- stdin 변환은 runtime 계층(`formatStdinFromLines`)에 두어 judge/turn 계층이 Docker CLI 세부사항을 알 필요 없게 했습니다.
- `docker exec -i`는 `stdinLines`가 있을 때만 사용해 stdin이 필요 없는 미션의 기존 실행 경로를 보존했습니다.

**Deviations from spec:**
- None intended. Runtime remains execution-only and does not decide pass or fail.

**Trade-offs:**
- stdin은 프로세스 실행마다 새 `docker exec`로 전달됩니다. 동일 컨테이너 재사용은 유지되지만 case마다 exec 오버헤드가 있습니다. calculator MVP 범위에서는 허용 가능합니다.
- `TurnsService`의 기존 turn submit 경로는 아직 `stdinLines`를 넘기지 않습니다. calculator 판정은 Task 5에서 case loop로 명시 호출해야 합니다.

**Open questions:**
- [x] Should stdin formatting live in runtime or judge layer? → Runtime (`formatStdinFromLines`) so adapters own Docker stdin wiring.
- [x] Should non-stdin missions keep the previous docker exec args? → Yes. Omit `-i` and `stdin` when `stdinLines` is undefined.

**Open risks or follow-ups:**
- Task 5 must overwrite the submitted file before each case run to avoid state leakage between repeated executions in one container.
- Task 5 must not move stdout comparison or strike logic into `integrations/runtime`.

**Instructions for the next worker:**
- Read `database/seeds/mission_templates.json` and resolve the current step's `judgePolicyJson.steps[].testCases[]` before implementing judging.
- For each public case, call `executeTurnCode()` (or a thin judge helper wrapping it) with `stdinLines` from the case bundle and the same `containerId` from the live mission.
- Preserve `stdout.trim()` exact match, empty stderr, and exit code 0 as the pass criteria documented in phase-1-foundation Task 2.
- Do not add a second container per case; reuse `game_room_missions.container_id` from Task 3.
