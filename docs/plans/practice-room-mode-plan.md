# Implementation Plan: Personal Practice Room Mode

## Overview

Add a `PRACTICE` game-room mode in which one authenticated user selects a difficulty and mission, then enters the existing game lifecycle immediately. The implementation must reuse rooms, participants, missions, turns, execution, judging, AI mission feedback, realtime events, and `MissionResult`; it must not introduce a separate practice engine or relax the existing time-limit and strike rules.

The backend contract is `POST /v1/practice-rooms` with `{ difficulty, missionTemplateId }`. A successful request creates an already-started one-person room and emits the existing `game-started` event; its HTTP response only confirms success. The client therefore waits for the realtime event before entering the gameplay screen.

## Scope

- In scope:
  - Persist and expose `GameMode = MULTIPLAYER | PRACTICE` on game rooms.
  - Create and immediately start a one-person practice room through an explicit HTTP API.
  - Enforce `minParticipants = maxParticipants = 1` and prohibit invitations to practice rooms.
  - Keep the existing turn/evaluation/result path unchanged while covering the one-player next-turn case with regression tests.
  - Define the client integration for practice entry, system-message-only presentation, and replay/navigation actions.
- Out of scope:
  - Unlimited time, unlimited strikes, or a “free practice” ruleset.
  - A new result persistence model, separate judge, container lifecycle, or realtime protocol family.
  - AI-command parsing for final practice-room creation.
  - Frontend implementation in this repository (no frontend source is present here).

## Current State Summary

- `GameRoomEntity` has room rules and participants but no `mode`; `GET /v1/game-rooms` serializes the current room summary.
- `GameRoomsService.createRoom()` already creates an owner membership and enforces a single `WAITING` membership; `startGame()` applies the normal mission, initial-turn, and container setup.
- `GameStartFlowService` publishes `game-started` and `game-state-updated` after the normal start flow. The existing `TurnsService` round-robin calculation already returns the same user when exactly one participant is joined.
- Invitations are enforced in `GameRoomParticipantsService.inviteParticipants()`, making it the service boundary that must reject `PRACTICE` rooms even if another caller bypasses the UI.
- The repository contains only the NestJS backend. Main-screen and result-screen UI work must be performed in the frontend consumer after the API/event contract lands.

## Architecture Decisions

- Add `GameMode` as a shared enum and persist `MULTIPLAYER` as the non-null default. Existing rooms therefore remain multiplayer after migration.
- Treat a practice-room request as an immediate-start orchestration, not a public waiting-room flow: create owner membership, apply practice rules, create the normal room mission and initial turn, set the room to `IN_PROGRESS`, then publish existing start events.
- Preserve normal-room creation and start behavior. Share the existing room-start internals rather than duplicating mission, runtime-container, or turn creation code.
- Use the existing waiting-room-membership lock/validation for practice creation, so a user cannot create a practice room while they have any active waiting-room membership. Confirm the existing active-room policy for `IN_PROGRESS` rooms before changing it; do not silently weaken or broaden it.
- Return `{ success: true }` from `POST /v1/practice-rooms`. Include `mode` in room summaries and realtime game-state payloads so the client can render the appropriate experience after `game-started` without relying on an untyped local assumption.
- Reject invitations to a practice room in the participant service with a stable conflict code (for example `PRACTICE_ROOM_INVITATION_NOT_ALLOWED`), not only by hiding UI controls.
- Keep system-message-only display as a client presentation rule. The backend continues to emit existing authoritative turn/evaluation events and AI mission-feedback data; it does not add a parallel chat implementation.

## Dependency Notes

1. Persisted mode and shared payload contracts must land before the API and client integration.
2. The immediate-start orchestration depends on the mode-aware entity and must reuse the existing start flow safely.
3. Invitation protection and singleton-turn regression coverage depend on a persisted practice room fixture.
4. Client work depends on the deployed API response and realtime payload shape.

## Task List

### Phase 1: Persisted Mode and Shared Contract

## Task 1: Add and expose the game-room mode

**Description:** Add the shared `GameMode` enum, a non-null `game_rooms.mode` column, and the mode field in server room/realtime response types. Backfill existing rows as `MULTIPLAYER` through the migration default so existing rooms retain their current semantics.

**Acceptance criteria:**
- [ ] `GameMode` contains exactly `MULTIPLAYER` and `PRACTICE` and is exported from `@shared/enums`.
- [ ] A reversible migration adds `game_rooms.mode text NOT NULL DEFAULT 'MULTIPLAYER'`; the entity maps it as `GameMode` and newly created normal rooms explicitly/default to `MULTIPLAYER`.
- [ ] `GET /v1/game-rooms` includes `mode` for every returned room.
- [ ] `game-started` and `game-state-updated` payloads expose the authoritative room mode alongside game state, with their interfaces and tests updated accordingly.
- [ ] No existing room status, difficulty, time-limit, strike-limit, or participant fields change meaning.

**Verification:**
- [ ] Tests pass: `pnpm test -- src/modules/game-rooms/controller/game-rooms.controller.spec.ts src/modules/game-rooms/service/game-start-flow.service.spec.ts`
- [ ] Tests pass: `pnpm test -- src/modules/realtime/service/realtime-event-support.service.spec.ts`
- [ ] Typecheck passes: `pnpm typecheck`
- [ ] Manual check: apply the migration to a disposable database and confirm an existing `game_rooms` row reads `MULTIPLAYER`.

**Dependencies:** None

**Files likely touched:**
- `src/shared/enums/game-room.enum.ts`
- `src/shared/enums/index.ts`
- `src/modules/game-rooms/entity/game-room.entity.ts`
- `src/modules/game-rooms/controller/game-rooms.controller.ts`
- `src/modules/game-rooms/service/game-start-flow.service.ts`
- `src/modules/realtime/service/realtime.interfaces.ts`
- `database/migrations/<timestamp>-AddGameRoomMode.ts`
- Associated unit specs

**Estimated scope:** M

## Task 2: Protect practice rooms from membership expansion

**Description:** Make participant-domain invitation operations reject a room whose mode is `PRACTICE`. This is a server-side invariant that protects the one-person room even if an AI command, future controller, or direct service caller attempts an invitation.

**Acceptance criteria:**
- [ ] `inviteParticipant()` and `inviteParticipants()` reject practice rooms before creating any invitation or publishing participant updates.
- [ ] The rejection is a deterministic client-visible conflict with a stable code and does not modify room or participant state.
- [ ] Multiplayer invitation behavior, ownership checks, maximum-participant checks, and existing invitation events remain unchanged.

**Verification:**
- [ ] Tests pass: `pnpm test -- src/modules/game-room-participants/service/game-room-participants.service.spec.ts`
- [ ] Manual check: a `PRACTICE` fixture retains only its owner membership after an attempted invite.

**Dependencies:** Task 1

**Files likely touched:**
- `src/modules/game-room-participants/service/game-room-participants.service.ts`
- `src/modules/game-room-participants/service/game-room-participants.service.spec.ts`

**Estimated scope:** S

### Checkpoint: Mode Contract

- [ ] Existing rooms migrate safely as `MULTIPLAYER`.
- [ ] API and realtime consumers can identify practice rooms.
- [ ] The server, not just the UI, prevents practice-room invitations.

### Phase 2: Immediate Practice-Start API

## Task 3: Implement `POST /v1/practice-rooms` as a mode-aware immediate-start flow

**Description:** Add an authenticated practice-room controller and application service that validates the requested difficulty and mission template, creates a room with the caller as the sole owner/joined participant, immediately runs the normal start flow, and publishes the normal realtime start events. Reuse the existing mission, runtime-container, turn, and authorization services; do not copy their logic into a practice-specific engine.

**Acceptance criteria:**
- [ ] `POST /v1/practice-rooms` accepts only `{ difficulty: 'EASY' | 'NORMAL' | 'HARD', missionTemplateId: UUID }`; unknown fields and malformed values follow the global validation policy.
- [ ] The persisted room has `mode: PRACTICE`, `minParticipants: 1`, `maxParticipants: 1`, the caller as owner and sole `JOINED` participant, and reaches `IN_PROGRESS` before success is returned.
- [ ] The selected mission is validated against the requested difficulty through the existing mission-selection rules, and the initial turn belongs to the caller with the normal room time limit and strike limit.
- [ ] The endpoint returns only `{ success: true }` through the existing response wrapper; the gameplay-entry signal is the existing `game-started` event, followed by `game-state-updated`.
- [ ] If mission/container/turn preparation or realtime start publication fails, the request leaves no blocking `WAITING` practice-room membership and releases any prepared runtime container. Implement this by safely reusing/refactoring the existing start transaction and compensation boundaries rather than deleting arbitrary active rooms.
- [ ] A user who already has a conflicting active room is rejected according to the existing one-active-room policy. If the current service only protects `WAITING` memberships, document the verified `IN_PROGRESS` behavior and add the smallest required enforcement only when the product invariant requires it.
- [ ] Normal `POST /v1/game-rooms/{gameRoomId}/start` behavior and response remain unchanged.

**Verification:**
- [ ] Tests pass: `pnpm test -- src/modules/game-rooms/controller/game-rooms.controller.spec.ts src/modules/game-rooms/service/game-rooms.service.spec.ts src/modules/game-rooms/service/game-start-flow.service.spec.ts`
- [ ] Add and run controller/service coverage for success, invalid difficulty, unknown/mismatched mission template, active-room conflict, and failure compensation.
- [ ] Typecheck passes: `pnpm typecheck`
- [ ] Manual check: authenticated request to `POST /v1/practice-rooms` produces a `PRACTICE` room with one joined owner, an in-progress first turn, and the existing `game-started` event.

**Dependencies:** Tasks 1-2

**Files likely touched:**
- `src/modules/game-rooms/controller/game-rooms.controller.ts` or a new `practice-rooms.controller.ts`
- `src/modules/game-rooms/service/game-rooms.service.ts`
- `src/modules/game-rooms/service/game-start-flow.service.ts`
- `src/modules/game-rooms/game-rooms.module.ts`
- New DTO/controller/service specs as appropriate

**Estimated scope:** M

## Task 4: Lock in one-player turn and result compatibility

**Description:** Add focused regression coverage proving that practice rooms use the existing turn, timeout, execution, AI-feedback, and `MissionResult` lifecycle without special-case rules. The production turn-selection algorithm already cycles a one-element participant list back to the same user; keep it unchanged unless a failing test identifies an actual gap.

**Acceptance criteria:**
- [ ] A non-final submitted or timed-out practice turn creates the next `IN_PROGRESS` turn for the same user with the normal deadline calculation.
- [ ] Final-step completion and strike-limit termination create the existing `MissionResult` records/payloads and finish the room exactly as a multiplayer room does.
- [ ] Existing evaluation feedback and system/realtime event production are preserved; no chat-specific practice engine or result table is introduced.
- [ ] No multiplayer round-robin behavior changes for two or more joined participants.

**Verification:**
- [ ] Tests pass: `pnpm test -- src/modules/turns/service/turns.service.spec.ts src/modules/mission-results/build-turn-evaluation-result-payload.spec.ts`
- [ ] Add and run a single-participant practice fixture through submit and timeout paths, asserting same-user next turn and existing mission-result output.
- [ ] Manual check: inspect `resolveNextPlayerUserId` coverage and confirm the production implementation remains shared rather than mode-forked.

**Dependencies:** Task 3

**Files likely touched:**
- `src/modules/turns/service/turns.service.spec.ts`
- `src/modules/mission-results/`
- Potentially no production-code changes expected

**Estimated scope:** S

### Checkpoint: Backend Complete

- [ ] Practice creation starts the same authoritative game lifecycle without a lobby.
- [ ] Practice rooms cannot gain invitees and preserve normal limits/judging.
- [ ] One-player turns, results, and realtime events are regression-covered.
- [ ] Targeted tests and `pnpm typecheck` pass.

### Phase 3: Frontend Consumer Integration (External Repository)

## Task 5: Implement the personal-practice entry and result actions

**Description:** In the frontend repository, add the main-screen practice flow and mode-aware presentation using the backend contract from Tasks 1-4. This is deliberately a consumer task: no frontend source exists in this backend repository.

**Acceptance criteria:**
- [ ] Main screen offers `개인 연습 시작`, then requires difficulty and mission selection before calling `POST /v1/practice-rooms`.
- [ ] After a successful HTTP response, the client remains on its transition/loading state and enters gameplay only after the matching `game-started` event; it uses the event/room `mode` rather than assuming practice from local navigation state.
- [ ] Practice gameplay hides/disables invitation and player-chat UI, while rendering AI Master/system feedback delivered through the existing authoritative event data.
- [ ] Result screen offers `같은 미션 다시 연습` (same difficulty/template, new practice-room request) and `다른 미션 선택` (return to mission selection); neither action mutates the completed room.
- [ ] The client handles the active-room conflict and standard validation errors without trying to create a second active room.

**Verification:**
- [ ] Frontend unit/integration tests cover request validation, waiting for `game-started`, singleton presentation, same-mission replay, and different-mission navigation.
- [ ] Manual end-to-end check: create a practice room, submit and time out at least one turn, finish a mission, replay it, then choose another mission.

**Dependencies:** Tasks 1-4 and access to the frontend repository

**Files likely touched:**
- Frontend main-screen, mission-selection, gameplay, realtime-store, and result-screen modules (exact paths are outside this repository)

**Estimated scope:** M

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A create-then-start failure leaves a one-person waiting room and blocks further play | High | Refactor/reuse start transaction and compensation boundaries; add failure-path tests that verify no blocking waiting membership remains. |
| Mode is exposed only in HTTP but not in realtime state | Medium | Add `mode` to both room summaries and start/state event contracts, then test both paths. |
| Invitation is hidden in the UI but accepted through AI/direct service calls | High | Enforce rejection inside `GameRoomParticipantsService` and cover it with a service-level test. |
| Practice implementation forks judging or result persistence | High | Make Tasks 3-4 explicitly call existing services and reject new practice-specific persistence/engine code in review. |
| “One active room” has ambiguous current coverage for `IN_PROGRESS` rooms | Medium | Establish behavior with a focused service test before changing policy; document the chosen invariant in the API error contract. |
| Frontend tries to navigate immediately after HTTP success | Medium | Treat `game-started` as the sole gameplay-entry signal and test delayed/reordered event handling. |

## Open Questions

- Does “one active room” formally include only `WAITING` memberships today, or must it include `IN_PROGRESS` practice/multiplayer rooms as well? Task 3 must verify the current product contract before changing this policy.
- Which existing realtime payload field/event will the frontend render as the AI Master’s system message, and is any additional stable message-type discriminator required? Default: reuse the existing mission-feedback/evaluation event data and make presentation mode-aware.
- Is a dedicated `GET /v1/game-rooms/{id}` current-room endpoint planned elsewhere? Default: the current accessible-room summary plus mode-bearing realtime events are sufficient for this MVP.

## Recommended Execution Order

1. Complete Task 1 (schema and shared contracts).
2. Complete Task 2 (server-side invitation invariant).
3. Complete Task 3 (practice API and immediate start), including its failure-path tests.
4. Complete Task 4 (turn/result regression coverage).
5. Hand the deployed API and event contract to the frontend owner for Task 5.

## Files to Read Before Implementation

- `src/modules/game-rooms/entity/game-room.entity.ts`
- `src/modules/game-rooms/service/game-rooms.service.ts`
- `src/modules/game-rooms/service/game-start-flow.service.ts`
- `src/modules/game-rooms/controller/game-rooms.controller.ts`
- `src/modules/game-room-participants/service/game-room-participants.service.ts`
- `src/modules/turns/service/turns.service.ts`
- `src/modules/realtime/service/realtime.interfaces.ts`
- `src/modules/realtime/service/realtime-event-support.service.ts`
- `src/modules/game-rooms/**/*.spec.ts`
- `src/modules/game-room-participants/**/*.spec.ts`
- `src/modules/turns/service/turns.service.spec.ts`
- `database/migrations/1779750000000-CreateGameRoomAndParticipantTables.ts`

## Do Not Read Unless Needed

- `docs/specs/**` except when code and this plan conflict on a public API, realtime payload, active-room rule, or room-state transition.
- `docs/implementaion-logs/**`.
- Unrelated LLM prompt templates; practice creation is an explicit API, not an AI-command feature.
