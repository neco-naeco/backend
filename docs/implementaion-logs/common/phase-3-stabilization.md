## [2026-05-28] C5: Harden timeout, authorization, and scenario coverage

**Plan reference:** `docs/plans/common-sequential-plan.md`

**Summary:**
- Hardened the shared gameplay path around timeout handling, duplicate submit protection, realtime authorization, disconnect cleanup, and spec-driven stabilization coverage.
- Wired realtime authentication, room-access validation, current-turn edit authorization, and disconnect cleanup to authoritative service-layer rules instead of permissive placeholders.
- Closed review findings across four follow-up passes so reconnect termination, duplicate submit handling, and final realtime broadcast order now align with `docs/specs/08-security-testing-and-delivery.md`.

**Dependencies reviewed before starting:**
- `docs/implementaion-logs/README.md`
- `docs/implementaion-logs/common/phase-1-foundation.md`
- `docs/implementaion-logs/common/phase-2-integration.md`
- `docs/plans/common-sequential-plan.md`
- `docs/specs/05-api-and-realtime.md`
- `docs/specs/06-gameplay-lifecycle.md`
- `docs/specs/08-security-testing-and-delivery.md`

**Implementation details:**
- Added realtime service implementations for access-token validation, room-membership access checks, room-state composition, and current-turn edit authorization so `join-room`, `code-change`, and disconnect handling now enforce spec ownership and membership rules through service-layer reads instead of default no-op services.
- Updated `DefaultRealtimeTurnSubmitService` to ignore only `TURN_NOT_IN_PROGRESS` duplicate-submit conflicts. Other `ConflictException` cases are logged and rethrown so real lifecycle integrity problems are no longer silently swallowed.
- Added disconnect-specific participant transition handling in `GameRoomParticipantsService.markJoinedParticipantLeftOnDisconnect()` and room finalization logic in `GameRoomsService.finishRoomIfBelowMinParticipants()`.
- Reworked `DatabaseRealtimeDisconnectService` to follow the MVP reconnect policy sequence:
  - mark the participant `LEFT`
  - broadcast `room-participants-updated`
  - timeout the owned in-progress turn when applicable
  - finish the room when remaining `JOINED` participants fall below `minParticipants`
  - broadcast the final `game-state-updated`
- Introduced `suppressNextTurnCreation` in `TurnsService` so disconnect-driven timeout termination can persist snapshot/execution/mission-result data without creating a new `IN_PROGRESS` turn when the room is about to terminate.
- Ensured disconnect termination does not expose an impossible intermediate realtime state. `RealtimeEventSupportService.publishTurnLifecycleResult()` now supports omitting the lifecycle `game-state-updated` broadcast, and disconnect cleanup uses that option before emitting the final `FINISHED` room state.
- Expanded test coverage around:
  - duplicate submit rejection vs allowed ignore path
  - non-member room access
  - non-owner game start
  - non-invited invitation acceptance
  - non-current-player submit
  - disconnect-triggered `LEFT` transition
  - disconnect-triggered timeout without next-turn creation
  - final room termination broadcast without leaked `IN_PROGRESS + turnState: null`

**Files changed:**
- `.gitignore`
- `src/modules/game-room-participants/service/game-room-participants.service.ts`
- `src/modules/game-room-participants/service/game-room-participants.service.spec.ts`
- `src/modules/game-rooms/game-rooms.module.ts`
- `src/modules/game-rooms/service/game-rooms.service.ts`
- `src/modules/game-rooms/service/game-rooms.service.spec.ts`
- `src/modules/realtime/realtime.module.ts`
- `src/modules/realtime/service/realtime-auth.service.ts`
- `src/modules/realtime/service/realtime-auth.service.spec.ts`
- `src/modules/realtime/service/realtime-defaults.service.ts`
- `src/modules/realtime/service/realtime-defaults.service.spec.ts`
- `src/modules/realtime/service/realtime-disconnect.service.ts`
- `src/modules/realtime/service/realtime-disconnect.service.spec.ts`
- `src/modules/realtime/service/realtime-event-support.service.ts`
- `src/modules/realtime/service/realtime-room-access.service.ts`
- `src/modules/realtime/service/realtime-room-access.service.spec.ts`
- `src/modules/realtime/service/realtime-room-state.service.ts`
- `src/modules/realtime/service/realtime-turn-edit.service.ts`
- `src/modules/realtime/service/realtime-turn-edit.service.spec.ts`
- `src/modules/realtime/service/realtime-turn-timeout.service.ts`
- `src/modules/realtime/service/realtime-turn-timeout.service.spec.ts`
- `src/modules/turns/service/turns.service.ts`
- `src/modules/turns/service/turns.service.spec.ts`
- `src/test/scenarios/spec-validation.scenarios.spec.ts`

**Verification:**
- [x] `./node_modules/.bin/jest --runInBand src/modules/turns/service/turns.service.spec.ts src/modules/realtime/service/realtime-disconnect.service.spec.ts src/test/scenarios/spec-validation.scenarios.spec.ts`
- [x] `./node_modules/.bin/jest --runInBand src/modules/realtime/service/realtime-disconnect.service.spec.ts src/modules/realtime/service/realtime-defaults.service.spec.ts src/test/scenarios/spec-validation.scenarios.spec.ts`
- [x] `./node_modules/.bin/tsc --noEmit -p tsconfig.json`
- [x] Review loop completed across four follow-up passes. Findings on disconnect ordering, conflict swallowing, fake scenario tests, next-turn leakage during room termination, and impossible intermediate broadcasts were all addressed in the final implementation.
- [ ] Full websocket integration scenario against a socket-bound environment was not run in this pass. Coverage here remains service/unit-scenario focused.

**Commit:**
- `3c1ca41` feat(common): 타임아웃·권한·시나리오 테스트 보강

**Impact on next tasks:**
- Shared-track stabilization is now documented through Task C5, and the sequential plan has an implementation log for all three phases.
- Realtime authorization and disconnect cleanup can be reused by later bug fixes without restoring placeholder services.
- Future gameplay or reconnect-related work should preserve the disconnect termination invariant: no new turn may be created when the room must terminate for insufficient joined participants.

**Design decisions made:**
- Kept timeout persistence inside `TurnsService` so manual submit and timeout continue to share one authoritative lifecycle implementation.
- Added a narrow `suppressNextTurnCreation` flag instead of creating a second timeout pipeline. This kept the diff local while still preventing disconnect-induced room termination from leaking a new active turn.
- Used an `omitGameStateUpdated` option in realtime event publishing instead of mutating broader event order for all callers. Only disconnect termination suppresses the intermediate lifecycle `game-state-updated`.

**Deviations from spec:**
- None intended in the final state. The earlier `IN_PROGRESS + turnState: null` disconnect broadcast mismatch was removed before final handoff.

**Trade-offs:**
- The disconnect path now carries a small amount of special-case orchestration (`suppressNextTurnCreation`, `omitGameStateUpdated`) to keep stabilization changes local. A larger refactor could fold room termination and timeout completion into one transaction boundary, but that was unnecessary for C5.
- Scenario validation remains mocked-repository and service-oriented rather than DB-backed end-to-end. This is sufficient to lock the C5 contracts, but not a substitute for future full integration coverage.

**Open questions:**
- [x] Should disconnect-induced timeout still create the next turn before room termination? -> No. Next-turn creation is explicitly suppressed when participant loss requires room termination.
- [x] Can duplicate submit handling ignore all conflicts? -> No. Only `TURN_NOT_IN_PROGRESS` is ignored; other conflicts surface.
- [x] Can the disconnect termination path emit an intermediate `IN_PROGRESS` state without a current turn? -> No. The final implementation suppresses that broadcast.

**Open risks or follow-ups:**
- A full websocket integration run in CI or a developer environment should still verify end-to-end socket behavior, especially close-code and broadcast timing around disconnect.
- The repository still lacks broader seeded integration coverage for combined auth + lobby + gameplay + realtime flows against a real Postgres instance.

**Instructions for the next worker:**
- If you touch disconnect or timeout sequencing, start from `DatabaseRealtimeDisconnectService`, `TurnsService`, and `RealtimeEventSupportService` together. Treat them as one behavioral unit.
- Do not broaden the duplicate-submit ignore path beyond `TURN_NOT_IN_PROGRESS`.
- Preserve the service-layer authority checks already added for room access, invitation ownership, room ownership, and current-turn ownership.

---

## [2026-05-30] Task 5: Implement current-step public case judging from `judgePolicyJson`

**Plan reference:** `docs/plans/calculator-mission-template-runtime-judging-plan.md`

**Summary:**
- `judgePolicyJson.steps[].testCases[]`를 현재 room-mission 스텝(`stepOrder`)에 맞춰 조회하고, 동일 `container_id` 컨테이너에서 공개 케이스를 모두 실행한 뒤 `PASSED` / `FAILED` / `ERROR`를 집계했습니다.
- 케이스별 `stdinLines`는 `ExecutionsService.executeTurnCode()`로 전달하며, 판정 비교(`stdout.trim()`, stderr, exit code)는 `integrations/runtime` 밖 `step-public-case-judge` helper에 둡니다.
- 리뷰 반영으로 첫 실패 시 중단하지 않고 모든 케이스를 실행한 후 최종 `judgeStatus`만 집계하며, stdout mismatch 시 `detectedIssues`에 `publicCaseResults` 기반 메시지를 채웁니다.

**Dependencies reviewed before starting:**
- `docs/plans/calculator-mission-template-runtime-judging-plan.md` — Task 5 acceptance criteria
- `docs/implementaion-logs/README.md` — logging contract
- `docs/implementaion-logs/common/phase-2-integration.md` — Task 3·4 handoff
- `docs/implementaion-logs/common/phase-1-foundation.md` — calculator seed `judgePolicyJson` contract
- `docs/specs/06-gameplay-lifecycle.md` — turn submit / judge authority boundary
- `docs/specs/07-integrations-and-ai.md` — execution-only runtime boundary

**Implementation details:**
- `resolveStepPublicTestCases()`가 mission root `judgePolicyJson.steps`에서 `stepOrder`에 맞는 케이스 번들을 파싱합니다. 번들이 없으면 기존 단일 `executeTurnCode()` 경로를 유지합니다.
- `runStepPublicCaseJudging()`는 각 케이스마다 제출 스냅샷 파일을 덮어쓴 뒤 `stdinLines`로 실행하고, `evaluatePublicTestCaseExecution()`으로 `exitCode === 0`·빈 stderr·`stdout.trim() === expectedStdout`을 검사합니다.
- `aggregatePublicCaseOutcomes()`는 `ERROR` > `FAILED` > `PASSED` 우선순위로 스텝 판정을 결정합니다. 대표 execution은 첫 실패 케이스, 전부 통과 시 마지막 케이스입니다.
- `TurnsService.executeSnapshot()`이 helper 결과를 `resolveNextState()`에 전달하고, `mission_results.result_payload_json`에 `publicCaseResults`를 포함합니다.
- `resolveDetectedIssueMessage()`는 `runtimeFailureMessage` → `stderr` → 첫 실패 `publicCaseResults` 메시지 → fallback 순으로 `detectedIssues[0].message`를 채워 빈 stderr stdout mismatch에서도 설명 가능한 메시지를 보장합니다.
- strike 증가, mission-result 상세 페이로드 정교화, end-to-end scenario coverage는 Task 6 범위로 남깁니다.

**Files changed:**
- `src/modules/turns/judge/step-public-case-judge.ts`
- `src/modules/turns/judge/step-public-case-judge.spec.ts`
- `src/modules/turns/service/turns.service.ts`
- `src/modules/turns/service/turns.service.spec.ts`

**Verification:**
- [x] `pnpm test -- src/modules/turns/judge/step-public-case-judge.spec.ts`
- [x] `pnpm test -- src/modules/turns/service/turns.service.spec.ts`
- [x] `pnpm typecheck`
- [x] Subagent review 1회 — 전 케이스 실행·`detectedIssues` 메시지·divide-by-zero/invalid-number 계약 테스트 반영 후 추가 피드백 없음

**Commit:**
- `aff8f74` feat(turns): judgePolicyJson 공개 케이스 판정 추가

**Impact on next tasks:**
- Task 6 can wire strike progression and richer mission-result payloads on top of `publicCaseResults` without reimplementing case execution or stdout comparison.
- Task 6 should extend scenario tests for failed stdout mismatch and runtime error paths while preserving the existing realtime submit → evaluate → turn-changed flow.
- Do not move pass/fail logic into `integrations/runtime`; keep judging in `TurnsService` / judge helper.

**Design decisions made:**
- Judging lives in a dedicated helper module rather than inline in `TurnsService` to keep runtime adapters execution-only and make case aggregation testable in isolation.
- All public cases run even after a failure so `publicCaseResults` reflects the full step attempt and final `judgeStatus` matches the plan wording.
- Legacy missions without `steps[].testCases[]` keep the pre-Task-5 single-execution judge path via `determineJudgeStatus()`.

**Deviations from spec:**
- None intended. Calculator exact output strings (`ERROR: division by zero`, `ERROR: invalid number`, etc.) are enforced via the same trim-exact comparison as success stdout.

**Trade-offs:**
- Each public case triggers a separate `executeTurnCode()` / `docker exec`, so step judging adds latency proportional to case count. Acceptable for the six-step calculator MVP.
- `publicCaseResults` is already persisted in mission-result payload, but Task 6 still needs client-facing detail shaping and strike/mission-finish integration tests.

**Open questions:**
- [x] Should judging stop on the first failed case? → No. Run all cases; aggregate final `judgeStatus` only.
- [x] Can stdout mismatch with empty stderr produce an empty `detectedIssues` message? → No. Use `publicCaseResults`-based failure text before fallback.

**Open risks or follow-ups:**
- Task 6 must confirm strike increment and mission-finish behavior still follow `docs/specs/06-gameplay-lifecycle.md` when `publicCaseResults` contains mixed per-case outcomes.
- Repeated executions in one container still depend on per-run file overwrite; add scenario coverage if state leakage appears in integration tests.

**Instructions for the next worker:**
- Start Task 6 from `TurnsService.resolveNextState()` and `buildMissionResultPayload()`; reuse `publicCaseResults` instead of re-parsing `judgePolicyJson` at the mission-results layer.
- Preserve all-case execution and `ERROR` > `FAILED` > `PASSED` aggregation when touching the judge helper.
- Read `database/seeds/mission_templates.json` step 5–6 cases when adding scenario tests for unsupported operator, divide-by-zero, and invalid-number paths.
