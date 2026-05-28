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
