# Realtime Contract Alignment Plan

## Context

Frontend gameplay entry and turn progression currently depend on WebSocket payloads that do not fully match the documented contract. The reported symptoms map directly to missing or drifted payload fields:

- `game-started.missionState` is missing mission metadata required for the mission guide and editor bootstrap.
- `room-participants-updated` is not consistently broadcast with both `participants` and `changedParticipant`.
- `code-change` / `code-updated` contract direction needed confirmation because the request and adjacent notes were not fully aligned.
- `turn-submit` payload shape has drifted from the documented `{ gameRoomId, userId, turnId, codeSnapshot, submittedAt }`.
- `turn-changed` does not always carry a complete `turnState`.
- `turn-evaluated.evaluationResult` is missing frontend-required feedback fields.

Because `docs/specs/00-overview.md` gives `docs/specs/05-api-and-realtime.md` higher precedence for external contracts, this plan fixes `code-change` / `code-updated` on whole-file `content` and limits cleanup work to bringing adjacent docs, tests, and implementation details into alignment with that decision.

## Scope

- In scope:
  - Align backend WebSocket request and response payloads with the requested gameplay contract.
  - Update spec documents that currently conflict with the intended contract.
  - Update transport, support-state, turn lifecycle, and payload-builder tests.
  - Update stale implementation logs or follow-up plans that still describe the older payloads.
- Out of scope:
  - Replacing the turn lifecycle itself.
  - Introducing Yjs or other CRDT infrastructure unless `codeDelta` requires a documented format change.
  - Changing unrelated HTTP endpoints.
  - Broad refactors outside the realtime, turn, room-participant, and mission-result boundaries.

## Assumptions

- The requested source of truth for this change is `docs/specs/05-api-and-realtime.md` plus the additional field requirements from the request.
- `code-change` and `code-updated` use whole-file `content` as the canonical external contract.
- No `codeDelta` rollout is planned in this workstream.
- Only the current turn player may mutate authoritative editor state; non-current participants may observe only.

## Architecture Decisions

- Reconcile docs and this plan around the confirmed `content` contract first, then shared TypeScript interfaces, then gateway and lifecycle publishers.
- Keep authoritative checks in service-layer modules. The gateway remains an orchestration boundary.
- Preserve support-state buffering around whole-file `content` snapshots for submit and timeout flows.
- Treat `turn-changed` and `turn-evaluated` as full-state broadcasts for frontend rendering, not thin transition notices.
- Prefer direct alignment to the confirmed contract rather than adding dual `codeDelta` and `content` paths.

## Task List

## Task 1: Reconcile the canonical websocket spec set before code changes

**Description:** Update the canonical spec and any adjacent docs or notes so they all reflect the confirmed `content`-based realtime sync contract.

**Acceptance criteria:**
- [ ] `docs/specs/05-api-and-realtime.md` describes:
  - `game-started.missionState.title`
  - `game-started.missionState.description`
  - `game-started.missionState.language`
  - `game-started.missionState.difficulty`
  - `game-started.missionState.projectStructure.files`
  - `room-participants-updated.participants`
  - `room-participants-updated.changedParticipant`
  - `code-change` primary payload as whole-file `content`
  - `code-updated` primary payload as whole-file `content`
  - `turn-submit` payload as `{ gameRoomId, userId, turnId, codeSnapshot, submittedAt }`
  - `turn-changed.turnState` as the required full next-turn payload
  - `turn-evaluated.evaluationResult.feedbackMessage`, `detectedIssues`, `strikeCount`, `remainingStrikeCount`, and `executionSummary`
- [ ] Any lower-priority doc or implementation note that still points to `codeDelta` for external sync is updated or annotated as superseded.
- [ ] Any remaining deviation from adjacent docs is explicit and justified in the text.

**Verification:**
- [ ] Manual check: search `docs/specs docs/etc docs/implementaion-logs docs/plans` for `codeDelta` mentions and confirm no external sync contract still depends on it.
- [ ] Manual check: source precedence in `docs/specs/00-overview.md` still agrees with the documented contract.

**Dependencies:** None

**Files likely touched:**
- `docs/specs/05-api-and-realtime.md`
- `docs/specs/06-gameplay-lifecycle.md`
- `docs/specs/07-integrations-and-ai.md`
- `docs/specs/08-security-testing-and-delivery.md`
- `docs/etc/api-spec.md`

**Estimated scope:** S

## Task 2: Align shared realtime DTOs and support-state interfaces to the reconciled contract

**Description:** Update the shared transport interfaces so the gateway, event publisher, and turn lifecycle all compile against the same `content`-based documented payload shapes.

**Acceptance criteria:**
- [ ] `src/modules/realtime/service/realtime.interfaces.ts` models the reconciled contract for:
  - `CodeChangePayload`
  - `CodeUpdatedEvent`
  - `TurnSubmitPayload`
  - `GameStartedEvent`
  - `TurnChangedEvent`
  - `TurnEvaluatedEvent`
  - `RoomParticipantsUpdatedEvent`
- [ ] `content` remains the canonical code-sync field in request and response DTOs.
- [ ] `code-updated.sessionId` may be added as an optional field only if echo suppression is required by the frontend contract.
- [ ] `turn-submit` no longer depends on the current ad hoc `files` payload as the primary external request contract.
- [ ] Support-state interfaces remain aligned around authoritative latest-file `content` snapshots used for submit and timeout.

**Verification:**
- [ ] `pnpm test -- src/modules/realtime/service/realtime-event-support.service.spec.ts src/modules/realtime/gateway/realtime.gateway.unit.spec.ts`
- [ ] `pnpm typecheck`
- [ ] Manual check: exported realtime interfaces reflect the confirmed whole-file client payload shape.

**Dependencies:** Task 1

**Files likely touched:**
- `src/modules/realtime/service/realtime.interfaces.ts`
- `src/modules/realtime/service/realtime.constants.ts`
- `src/integrations/redis/realtime-support-state.store.ts`
- `src/modules/realtime/service/realtime-event-support.service.ts`

**Estimated scope:** M

## Task 3: Fix gameplay-entry and participant state broadcasts

**Description:** Make `game-started` and `room-participants-updated` consistently broadcast the full documented room and mission context needed by the frontend.

**Acceptance criteria:**
- [ ] `game-started.missionState` includes `title`, `description`, `language`, `difficulty`, and `projectStructure.files`.
- [ ] `game-started.missionState.projectStructure.files[*]` still includes `filePath`, `language`, `readonly`, and `fileUrl`.
- [ ] `room-participants-updated` is emitted on join, leave, and participant membership-status changes.
- [ ] Each `room-participants-updated` payload includes both:
  - the full `participants` list
  - the single `changedParticipant` relevant to the transition, or `null` only when no single participant changed
- [ ] Post-start participant updates still include the current `gameState` and `missionState` required for re-rendering or late synchronization.

**Verification:**
- [ ] `pnpm test -- src/modules/game-rooms/service/game-start-flow.service.spec.ts`
- [ ] `pnpm test -- src/modules/realtime/gateway/realtime.gateway.spec.ts`
- [ ] `pnpm test -- src/modules/game-room-participants/service/game-room-participants.service.spec.ts`
- [ ] Manual check: a join after room creation and a leave after game start both produce complete `room-participants-updated` payloads.

**Dependencies:** Task 2

**Files likely touched:**
- `src/modules/game-rooms/service/game-start-flow.service.ts`
- `src/modules/realtime/service/realtime-room-state.service.ts`
- `src/modules/realtime/service/realtime-disconnect.service.ts`
- `src/modules/game-room-participants/service/game-room-participants.service.ts`
- `src/modules/realtime/service/realtime-event-support.service.ts`

**Estimated scope:** M

## Task 4: Align code sync request and broadcast flow to whole-file `content` plus turn ownership rules

**Description:** Change realtime edit ingestion and fan-out so the backend accepts the documented whole-file `content` contract, applies edits only for the current turn player, and emits the documented `code-updated` payload.

**Acceptance criteria:**
- [ ] `code-change` accepts the documented payload shape with whole-file `content`.
- [ ] The server ignores `code-change` from non-current-turn players.
- [ ] The server updates ephemeral support state from incoming whole-file payloads and maintains authoritative snapshot state for submit and timeout flows.
- [ ] `code-updated` broadcasts whole-file `content` as the primary sync payload.
- [ ] `code-updated.sessionId` may be added as an optional field for echo suppression when needed.
- [ ] Existing timeout and submit flows continue to use the latest authoritative buffered file content.

**Verification:**
- [ ] `pnpm test -- src/modules/realtime/gateway/realtime.gateway.spec.ts`
- [ ] `pnpm test -- src/modules/realtime/service/realtime-turn-timeout.service.spec.ts`
- [ ] `pnpm typecheck`
- [ ] Manual check: current-turn-only edit authorization still holds after the payload migration.

**Dependencies:** Task 2

**Files likely touched:**
- `src/modules/realtime/gateway/realtime.gateway.ts`
- `src/modules/realtime/gateway/realtime.gateway.spec.ts`
- `src/modules/realtime/service/realtime-turn-edit.service.ts`
- `src/integrations/redis/realtime-support-state.store.ts`

**Estimated scope:** M

## Task 5: Align turn submission, evaluation, and next-turn broadcasts

**Description:** Update submit intake and lifecycle result publishing so `turn-submit`, `turn-evaluated`, and `turn-changed` carry the documented full-state payloads required by the frontend.

**Acceptance criteria:**
- [ ] `turn-submit` accepts `{ gameRoomId, userId, turnId, codeSnapshot, submittedAt }`.
- [ ] The submit path validates:
  - joined participant identity
  - current turn player identity
  - matching `turnId`
  - `IN_PROGRESS` turn status
- [ ] `turn-changed` always includes a complete `turnState` with at least:
  - `turnId`
  - `turnNumber`
  - `currentPlayerId`
  - `startedAt`
  - `deadlineAt`
  - `timeLimitSeconds`
  - `remainingTimeSeconds`
  - `status`
- [ ] `turn-evaluated.evaluationResult` always includes:
  - `feedbackMessage`
  - `detectedIssues`
  - `strikeCount`
  - `remainingStrikeCount`
  - `executionSummary`
- [ ] `detectedIssues` remains structured enough for frontend error highlighting, including file path and line-level metadata when available.

**Verification:**
- [ ] `pnpm test -- src/modules/realtime/service/realtime-event-support.service.spec.ts`
- [ ] `pnpm test -- src/modules/mission-results/build-turn-evaluation-result-payload.spec.ts`
- [ ] `pnpm test -- src/modules/turns/service/turns.service.spec.ts src/modules/executions/service/executions.service.spec.ts`
- [ ] `pnpm test -- src/test/scenarios/spec-validation.scenarios.spec.ts`
- [ ] Manual check: submit success and submit failure both produce `turn-evaluated` before any `turn-changed`.

**Dependencies:** Tasks 2-4

**Files likely touched:**
- `src/modules/realtime/gateway/realtime.gateway.ts`
- `src/modules/realtime/service/realtime-event-support.service.ts`
- `src/modules/turns/service/turns.service.ts`
- `src/modules/mission-results/build-turn-evaluation-result-payload.ts`
- `src/modules/executions/service/executions.service.ts`

**Estimated scope:** M

## Task 6: Refresh scenario coverage and stale implementation logs

**Description:** Lock the aligned contract down with scenario tests and update implementation notes that still describe superseded payload shapes.

**Acceptance criteria:**
- [ ] Scenario coverage asserts the updated payload shapes for:
  - `game-started`
  - `room-participants-updated`
  - `code-updated`
  - `turn-evaluated`
  - `turn-changed`
- [ ] Implementation logs and follow-up plans no longer describe `codeDelta` as the intended external contract for `code-change` / `code-updated`.
- [ ] Follow-up plans or open-question docs are annotated so future work does not reintroduce the old payload assumptions.

**Verification:**
- [ ] `pnpm test -- src/test/scenarios/spec-validation.scenarios.spec.ts`
- [ ] Manual check: search `docs/plans docs/implementaion-logs docs/etc` for stale `codeDelta` contract language.

**Dependencies:** Tasks 1-5

**Files likely touched:**
- `src/test/scenarios/spec-validation.scenarios.spec.ts`
- `docs/implementaion-logs/common/phase-4-contract-alignment.md`
- `docs/implementaion-logs/worker-3/phase-1-realtime.md`
- `docs/implementaion-logs/worker-3/phase-2-runtime.md`
- `docs/plans/worker-3-realtime-runtime-execution-plan.md`

**Estimated scope:** S

## Checkpoints

### Checkpoint 1: Contract Frozen

- [ ] Docs no longer conflict on `codeDelta` vs `content`
- [ ] Shared realtime interfaces compile against one canonical contract

### Checkpoint 2: Gameplay Entry Fixed

- [ ] `game-started` includes the mission fields the frontend needs to render immediately
- [ ] `room-participants-updated` is emitted consistently with full room state

### Checkpoint 3: Turn Loop Fixed

- [ ] `code-change` / `code-updated` follow the documented sync payload
- [ ] `turn-submit` intake matches the documented request shape
- [ ] `turn-evaluated` and `turn-changed` include the full state the frontend expects

### Checkpoint 4: Ready for Frontend Validation

- [ ] Scenario tests cover the aligned contract
- [ ] Historical docs no longer describe superseded payloads

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Lower-priority docs may still point to `codeDelta` after the contract is confirmed as `content` | Medium | Update or annotate those docs in Task 1 and Task 6 so future work does not reopen the decision |
| Whole-file sync could still drift from submit and timeout snapshot behavior | High | Keep buffered latest-file content as the shared source for submit plus timeout paths and cover both in tests |
| Some current tests and implementation logs may still encode older submit or event payload shapes | Medium | Update scenario tests and stale docs in the same workstream so contract drift is visible immediately |
| Participant updates after game start may need both lobby and gameplay state slices | Medium | Treat `room-participants-updated` as a full-state event, not a lobby-only event |

## Open Questions

- Should `turn-evaluated.detectedIssues.lineNumber` remain optional or become required when the judge can infer a precise line?
  - Default assumption: optional, but present whenever the backend can produce it safely.

## Recommended Execution Order

1. Freeze and reconcile the canonical spec documents.
2. Update shared realtime DTOs and support-state interfaces.
3. Fix `game-started` and `room-participants-updated`.
4. Align `code-change` / `code-updated` to the confirmed whole-file `content` contract.
5. Migrate `turn-submit`, `turn-evaluated`, and `turn-changed`.
6. Finish with scenario coverage and stale-doc cleanup.

## Files to Review Before Implementation

- `docs/specs/00-overview.md`
- `docs/specs/05-api-and-realtime.md`
- `docs/specs/06-gameplay-lifecycle.md`
- `docs/etc/api-spec.md`
- `src/modules/realtime/service/realtime.interfaces.ts`
- `src/modules/realtime/gateway/realtime.gateway.ts`
- `src/modules/realtime/service/realtime-event-support.service.ts`
- `src/modules/game-rooms/service/game-start-flow.service.ts`
- `src/modules/mission-results/build-turn-evaluation-result-payload.ts`
- `src/test/scenarios/spec-validation.scenarios.spec.ts`
