# Game Start Response Alignment Plan

## Context

As of 2026-06-01, the documented success response for `POST /v1/game-rooms/{gameRoomId}/start` in `docs/etc/api-spec.md` does not match the current backend implementation.

- Documented success response:
  - `data.success: true`
- Current backend success response:
  - `data.gameRoomId`
  - `data.gameRoomMissionId`
  - `data.status`
  - `data.updatedAt`

This document describes the plan to change the backend so the success response matches `docs/etc/api-spec.md`.

## Scope

- In scope:
  - Align the HTTP success payload of `POST /v1/game-rooms/{gameRoomId}/start` to the current `docs/etc/api-spec.md` contract.
  - Update tests and validation artifacts that currently assert the richer payload.
  - Preserve existing auth, validation, game-start side effects, and websocket publishing behavior.
- Out of scope:
  - Changing the request shape.
  - Changing the start-game domain flow.
  - Removing the shared `data/meta/error` response wrapper.
  - Refactoring unrelated game-room or mission logic.

## Current State Summary

- The authoritative HTTP endpoint lives in `src/modules/game-rooms/controller/game-rooms.controller.ts`.
- The controller currently returns room and mission identifiers plus `status` and `updatedAt`.
- The common `ResponseInterceptor` still wraps that controller return value as `{ data, meta, error }`.
- `GameStartFlowService` publishes realtime events after the domain start succeeds, so the frontend can still transition into gameplay without needing a rich HTTP success payload.
- Existing logs already describe the richer response as part of Worker 2 mission delivery, so those notes become historically stale once this change lands.

## Architecture Decisions

- Keep the transport-level response wrapper unchanged and only shrink the `data` payload for the start endpoint.
- Treat websocket events (`game-started`, `game-state-updated`) as the authoritative gameplay-entry channel after start succeeds.
- Keep the start endpoint as an action endpoint returning `200`, not `204`, because the documented contract already defines a success body.
- Prefer a controller-local response DTO change over changing domain services, because the domain layer still needs the richer result for realtime publication.

## Dependency Notes

- This is a shared-contract change even though the code lives in Worker 2-owned files, because it changes what frontend and spec-validation consumers observe over HTTP.
- The safest order is:
  1. Update the controller response contract.
  2. Update unit/spec-validation tests.
  3. Update any stale implementation log text that claims the richer payload is part of the public API.

## Task List

## Task 1: Replace the public start success DTO with the documented minimal payload

**Description:** Update the controller-level success response for `POST /v1/game-rooms/{gameRoomId}/start` so the endpoint returns only the documented success indicator in `data`, while preserving the current start flow invocation and error behavior.

**Acceptance criteria:**
- [ ] `POST /v1/game-rooms/{gameRoomId}/start` returns `{ data: { success: true }, meta, error: null }` on success.
- [ ] The controller no longer exposes `gameRoomId`, `gameRoomMissionId`, `status`, or `updatedAt` in the HTTP success payload.
- [ ] `GameStartFlowService.startGame()` is still called exactly once and its side effects remain intact.

**Verification:**
- [ ] Tests pass: `pnpm test -- src/modules/game-rooms/controller/game-rooms.controller.spec.ts`
- [ ] Typecheck succeeds: `pnpm typecheck`
- [ ] Manual check: inspect the controller return shape and confirm the interceptor would wrap it as `{ data: { success: true }, meta, error: null }`

**Dependencies:** None

**Files likely touched:**
- `src/modules/game-rooms/controller/game-rooms.controller.ts`
- `src/modules/game-rooms/controller/game-rooms.controller.spec.ts`

**Estimated scope:** XS

## Task 2: Update shared contract validation coverage to assert the documented response

**Description:** Adjust spec-driven and scenario-style tests that currently encode the richer start response so the automated contract checks reflect the minimal documented success body instead.

**Acceptance criteria:**
- [ ] Any spec-validation or scenario coverage for game start asserts `data.success === true`.
- [ ] No remaining test expects `gameRoomMissionId` or `updatedAt` from the start HTTP response unless that assertion is about internal service results rather than the public controller response.
- [ ] Existing service-layer tests continue to validate domain return values separately from the public HTTP contract.

**Verification:**
- [ ] Tests pass: `pnpm test -- src/test/scenarios/spec-validation.scenarios.spec.ts`
- [ ] Tests pass: `pnpm test -- src/modules/game-rooms/service/game-start-flow.service.spec.ts src/modules/game-rooms/service/game-rooms.service.spec.ts`
- [ ] Manual check: search for `gameRoomMissionId` expectations and confirm HTTP-response assertions were narrowed intentionally

**Dependencies:** Task 1

**Files likely touched:**
- `src/test/scenarios/spec-validation.scenarios.spec.ts`
- `src/modules/game-rooms/controller/game-rooms.controller.spec.ts`
- Possibly no changes needed in:
  - `src/modules/game-rooms/service/game-start-flow.service.spec.ts`
  - `src/modules/game-rooms/service/game-rooms.service.spec.ts`

**Estimated scope:** S

## Checkpoint: After Tasks 1-2

- [ ] Start endpoint returns the documented minimal HTTP success body
- [ ] Controller and spec-validation tests agree on the public contract
- [ ] Typecheck and targeted tests pass before touching historical logs

## Task 3: Update stale implementation notes that describe the old public response

**Description:** Revise existing implementation-log text that currently states the start endpoint returns room and mission identifiers, so future readers do not mistake the old transport shape for the current public contract.

**Acceptance criteria:**
- [ ] Historical notes in `docs/implementaion-logs` that explicitly describe the old public start response are updated or annotated as superseded.
- [ ] The new note clearly distinguishes internal service results from the public HTTP payload.
- [ ] No spec document change is needed if `docs/etc/api-spec.md` remains the source of truth and stays unchanged.

**Verification:**
- [ ] Manual check: search `docs/implementaion-logs` for `gameRoomMissionId`, `updatedAt`, and `returning the started room ID`
- [ ] Manual check: updated text no longer conflicts with `docs/etc/api-spec.md`

**Dependencies:** Task 2

**Files likely touched:**
- `docs/implementaion-logs/worker-2/phase-2-missions.md`
- Potentially a new shared note under `docs/implementaion-logs/common/`

**Estimated scope:** XS

## Checkpoint: Complete

- [ ] Public HTTP contract matches `docs/etc/api-spec.md`
- [ ] Automated validation reflects the minimal success payload
- [ ] Historical logs no longer misdescribe the public start response
- [ ] Ready for frontend confirmation

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Frontend may already read `data.status` or `data.gameRoomMissionId` defensively in some hidden path | Medium | Before merging, grep the frontend for start-response field access and confirm it only gates on success plus websocket events |
| A controller test file may not exist or may live under a different path in the target branch | Low | Search for `GameRoomsController` and update the actual test location rather than assuming a fixed filename |
| Historical logs can become misleading if left untouched | Low | Add a short superseded note in the affected log entry instead of silently leaving conflicting text |

## Open Questions

- Does any frontend code path currently consume `data.status`, `data.updatedAt`, or `data.gameRoomMissionId` from the start response despite the documented websocket-first flow?
- Should the temporary `GET /v1/game-rooms/{gameRoomId}/start` compatibility route return the same minimal success body for consistency? Default assumption: yes.

## Recommended Execution Order

1. Change the controller DTO and response shape.
2. Update controller/spec-validation tests.
3. Run targeted tests plus typecheck.
4. Update stale implementation-log language.

## Files to Review Before Implementation

- `docs/etc/api-spec.md`
- `docs/specs/05-api-and-realtime.md`
- `src/modules/game-rooms/controller/game-rooms.controller.ts`
- `src/common/interceptors/response.interceptor.ts`
- `src/test/scenarios/spec-validation.scenarios.spec.ts`
- `docs/implementaion-logs/worker-2/phase-2-missions.md`
