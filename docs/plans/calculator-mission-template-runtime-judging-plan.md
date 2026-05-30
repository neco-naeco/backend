# Implementation Plan: Calculator Mission Template, Runtime, and Step Judging

## Overview

This plan covers the first fully-playable mission slice for the backend: one calculator mission template, one reusable Python runner image, runtime container preparation at game start, and step-by-step server-side judging driven by public test cases. The goal is to close the path from seeded mission data through game start, turn submission, runtime execution, and strike-based step judgment without introducing extra mission types or flexible grading logic.

## Architecture Decisions

- Keep `mission_templates` and `docker_images` as separate domains. Mission templates reference a reusable runtime image definition instead of storing a concrete image string inline.
- Seed mission data from repository JSON files on application bootstrap, following the existing prompt-template seed pattern so calculator mission data is versioned and reproducible.
- Keep runtime adapters execution-only. `integrations/runtime` prepares containers and runs commands, while `TurnsService` or a small judge helper reads `judgePolicyJson` and decides `PASSED`, `FAILED`, or `ERROR`.
- Store step-specific public test cases inside the mission template root `judgePolicyJson`, keyed by `stepOrder`, to minimize schema churn while supporting current-step case selection.
- Judge each step by running all public cases for that step in the same room-mission container, passing stdin directly to the executed process and comparing `stdout.trim()` to the exact expected string.
- Treat this plan as a shared follow-up track for logging purposes. After each completed task, the coding agent must append one task log entry under `docs/implementaion-logs/common/` before starting the next task.

## Implementation Logging Requirement

- Use `docs/implementaion-logs/README.md` as the logging contract before starting any task from this plan.
- Record Task 1-2 work in `docs/implementaion-logs/common/phase-1-foundation.md`.
- Record Task 3-4 work in `docs/implementaion-logs/common/phase-2-integration.md`.
- Record Task 5-6 work in `docs/implementaion-logs/common/phase-3-stabilization.md`.
- Append exactly one log entry per completed task using the existing log template and include the exact task ID from this plan.
- Do not treat a task as closed until both of these exist:
  - a dedicated commit for that task
  - a matching log entry in the required `docs/implementaion-logs/common/` file

## Task List

### Phase 1: Data Contracts and Seed Baseline

## Task 1: Align schema and entities with calculator mission metadata

**Description:** Add the minimum persistent fields needed to store the agreed calculator mission data and reusable runtime image metadata, keeping the model aligned with `docs/specs/02-domain-model.md`, `docs/specs/04-data-model.md`, and the ERD.

**Acceptance criteria:**
- [ ] `mission_templates` supports minimum mission metadata required by the calculator template, including title, description, language, and success criteria alongside the existing judge and project structure payloads.
- [ ] `mission_template_steps` supports minimum step metadata required by the agreed six-step flow, including title, description, and human-readable success criteria in addition to target file and hint text.
- [ ] `docker_images` persistence exists and `mission_templates.docker_image_id` resolves to that table rather than an opaque standalone UUID.
- [ ] Entity names, column names, and relationships remain consistent with the existing spec and naming conventions.

**Verification:**
- [ ] Targeted tests pass: `pnpm test -- src/modules/game-room-missions/service/game-room-missions.service.spec.ts`
- [ ] Typecheck passes: `pnpm typecheck`
- [ ] Manual check: schema and entity fields match the agreed terminology in `docs/specs/02-domain-model.md` and the ERD.
- [ ] Log entry appended: `docs/implementaion-logs/common/phase-1-foundation.md`

**Dependencies:** None

**Files likely touched:**
- `src/modules/game-room-missions/entity/mission-template.entity.ts`
- `src/modules/game-room-missions/entity/mission-template-step.entity.ts`
- `src/modules/docker-images/` or equivalent runtime-image entity module
- `src/database/`
- `database/migrations/`

**Estimated scope:** Medium: 3-5 files

## Task 2: Add seed infrastructure and calculator mission seed data

**Description:** Create bootstrap seed loading for `docker_images`, `mission_templates`, and `mission_template_steps`, and add the agreed calculator mission JSON records including starter files, six step definitions, public test cases, and the single Python runner image reference.

**Acceptance criteria:**
- [ ] Repository seed files exist for the calculator mission template, its six steps, and the referenced Python runner image.
- [ ] Application bootstrap upserts seed records deterministically, following the same repository-driven pattern already used for prompt templates.
- [ ] The calculator mission seed includes the agreed runtime contract: Python-only language, prompt-free stdin flow, exact output strings, six cumulative steps, and public per-step case bundles in `judgePolicyJson`.
- [ ] Starter files in `projectStructureJson` include a minimal `main.py` skeleton and a read-only `README.md`.

**Verification:**
- [ ] Targeted tests pass: `pnpm test -- src/modules/prompt-template/prompt-template-seed.service.spec.ts`
- [ ] Targeted tests pass: `pnpm test -- src/modules/game-room-missions/service/game-room-missions.service.spec.ts`
- [ ] Manual check: seed JSON is readable and the calculator mission data matches the agreed six-step behavior and exact error strings.
- [ ] Log entry appended: `docs/implementaion-logs/common/phase-1-foundation.md`

**Dependencies:** Task 1

**Files likely touched:**
- `database/seeds/docker_images.json`
- `database/seeds/mission_templates.json`
- `database/seeds/mission_template_steps.json`
- `src/modules/game-room-missions/`
- `src/modules/prompt-template/` or shared seed bootstrap utilities

**Estimated scope:** Medium: 3-5 files

### Checkpoint: Data Baseline

- [ ] Tasks 1-2 are complete
- [ ] The database model can store the calculator mission and its runtime image without JSON-only workarounds
- [ ] Seeded calculator mission data is stable enough for runtime and judging work to consume
- [ ] `docs/implementaion-logs/common/phase-1-foundation.md` contains Task 1 and Task 2 entries

### Phase 2: Runtime Preparation and Execution Contract

## Task 3: Prepare the room-mission container from the seeded Docker image

**Description:** Wire game start to resolve the mission template's `dockerImageId`, map it to the concrete Python runner image, start the room-mission container, and persist the resulting container ID on the live room mission.

**Acceptance criteria:**
- [ ] Game start resolves the selected mission template to a persisted Docker image record before mission creation completes.
- [ ] `integrations/runtime` is invoked during game start to create one runner container for the room mission using the resolved image reference.
- [ ] The resulting container ID is stored in `game_room_missions.container_id` and is available for later turn execution.
- [ ] Runtime preparation failures surface explicitly and do not silently mark the mission as started.

**Verification:**
- [ ] Targeted tests pass: `pnpm test -- src/modules/game-rooms/service/game-rooms.service.spec.ts`
- [ ] Targeted tests pass: `pnpm test -- src/integrations/runtime/runtime-defaults.service.spec.ts`
- [ ] Manual check: the game-start path now matches the runtime lifecycle described in `docs/specs/07-integrations-and-ai.md`.
- [ ] Log entry appended: `docs/implementaion-logs/common/phase-2-integration.md`

**Dependencies:** Task 2

**Files likely touched:**
- `src/modules/game-rooms/service/game-rooms.service.ts`
- `src/modules/game-room-missions/service/game-room-missions.service.ts`
- `src/integrations/runtime/runtime-defaults.service.ts`
- `src/integrations/runtime/runtime.interfaces.ts`
- `src/modules/game-rooms/`

**Estimated scope:** Medium: 3-5 files

## Task 4: Extend runtime execution to support stdin-driven console cases

**Description:** Expand the runtime execution contract so the calculator mission judge can pass test input directly into the executed process while keeping the room-mission container reuse model intact.

**Acceptance criteria:**
- [ ] Runtime execution input supports a stdin payload derived from `stdinLines`.
- [ ] The Docker runtime adapter passes stdin to the executed process while preserving timeout and failure behavior.
- [ ] Execution persistence continues to store stdout, stderr, exit code, and runtime failure metadata without changing the room authority model.
- [ ] Existing non-stdin execution behavior remains compatible for future missions that do not require console input.

**Verification:**
- [ ] Targeted tests pass: `pnpm test -- src/integrations/runtime/runtime-defaults.service.spec.ts`
- [ ] Targeted tests pass: `pnpm test -- src/modules/executions/service/executions.service.spec.ts`
- [ ] Typecheck passes: `pnpm typecheck`
- [ ] Log entry appended: `docs/implementaion-logs/common/phase-2-integration.md`

**Dependencies:** Task 3

**Files likely touched:**
- `src/integrations/runtime/runtime.interfaces.ts`
- `src/integrations/runtime/runtime-defaults.service.ts`
- `src/modules/executions/service/executions.service.ts`
- `src/integrations/runtime/runtime-defaults.service.spec.ts`
- `src/modules/executions/service/executions.service.spec.ts`

**Estimated scope:** Medium: 3-5 files

### Checkpoint: Runtime Slice

- [ ] Tasks 3-4 are complete
- [ ] A seeded calculator mission can start a Python runner container and accept stdin-based execution requests
- [ ] Runtime behavior is still execution-only and does not decide pass or fail
- [ ] `docs/implementaion-logs/common/phase-2-integration.md` contains Task 3 and Task 4 entries

### Phase 3: Step Judging and Regression Coverage

## Task 5: Implement current-step public case judging from `judgePolicyJson`

**Description:** Add a focused judge helper or `TurnsService` extension that reads the current step's public cases from `judgePolicyJson`, runs them all in the active room-mission container, and decides `PASSED`, `FAILED`, or `ERROR` from the combined results.

**Acceptance criteria:**
- [ ] The current room mission step order resolves to the matching case bundle in the mission template root `judgePolicyJson`.
- [ ] Each case executes in the same room-mission container using stdin derived from `stdinLines`.
- [ ] A step passes only when every case exits cleanly, emits no stderr, and produces `stdout.trim()` exactly equal to `expectedStdout`.
- [ ] A single mismatched case produces `FAILED`, while runtime-level failures still produce `ERROR`.

**Verification:**
- [ ] Targeted tests pass: `pnpm test -- src/modules/turns/service/turns.service.spec.ts`
- [ ] Typecheck passes: `pnpm typecheck`
- [ ] Manual check: the calculator mission's exact output contracts are enforced for success, unsupported operators, divide-by-zero, and invalid number input.
- [ ] Log entry appended: `docs/implementaion-logs/common/phase-3-stabilization.md`

**Dependencies:** Task 4

**Files likely touched:**
- `src/modules/turns/service/turns.service.ts`
- `src/modules/turns/` helper or judge utility file
- `src/modules/turns/service/turns.service.spec.ts`
- `src/shared/`

**Estimated scope:** Medium: 3-5 files

## Task 6: Integrate strike progression, mission-result payloads, and end-to-end calculator scenarios

**Description:** Finish the calculator mission slice by wiring the new judge outcome into strike progression, mission-result payload details, and scenario coverage so the six-step mission can be validated end-to-end.

**Acceptance criteria:**
- [ ] Step failure increments `strikeCount`, keeps the current step active according to existing mission-step transition rules, and finishes the mission when the room strike limit is reached.
- [ ] Mission result payloads include enough per-case information to explain why a calculator step passed or failed without relying on AI-generated judgment.
- [ ] Scenario tests cover at least one passing step, one failed stdout mismatch, one unsupported operator case, and one runtime error path.
- [ ] The calculator mission remains compatible with existing realtime event emission and next-turn creation flow.

**Verification:**
- [ ] Targeted tests pass: `pnpm test -- src/modules/turns/service/turns.service.spec.ts`
- [ ] Targeted tests pass: `pnpm test -- src/test/scenarios/spec-validation.scenarios.spec.ts`
- [ ] Build succeeds: `pnpm build`
- [ ] Manual check: one calculator room can progress through step judgment and strike accumulation without contract drift from `docs/specs/06-gameplay-lifecycle.md`.
- [ ] Log entry appended: `docs/implementaion-logs/common/phase-3-stabilization.md`

**Dependencies:** Task 5

**Files likely touched:**
- `src/modules/turns/service/turns.service.ts`
- `src/modules/mission-results/service/mission-results.service.ts`
- `src/test/scenarios/spec-validation.scenarios.spec.ts`
- `src/modules/realtime/`

**Estimated scope:** Medium: 3-5 files

### Checkpoint: Complete

- [ ] All acceptance criteria are met
- [ ] The calculator mission is seedable, startable, executable, and judgeable end-to-end
- [ ] Runtime, mission template, and turn judgment responsibilities remain separated by the agreed boundaries
- [ ] `docs/implementaion-logs/common/phase-3-stabilization.md` contains Task 5 and Task 6 entries
- [ ] Ready for implementation review and execution

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Schema drift between current entities and the ERD introduces migration churn | High | Implement Task 1 first and keep the calculator slice aligned with `docs/specs/02-domain-model.md` and `docs/specs/04-data-model.md` before touching runtime or judging |
| Runtime changes accidentally mix execution and judgment concerns | High | Keep stdin support inside runtime adapters only and place all case comparison logic in `TurnsService` or a dedicated judge helper |
| Step-case payload shape becomes too ad hoc to reuse later | Medium | Freeze one explicit `judgePolicyJson.steps[].testCases[]` structure during Task 2 and reuse it consistently through Tasks 5-6 |
| Reusing one container across many cases leaks state between runs | Medium | Limit the calculator MVP to a single-file mission, overwrite the submitted file before each run, and add targeted tests for deterministic repeated execution |

## Open Questions

- `docker_image_deployments` is part of the broader ERD but may not be required for this calculator MVP slice. Confirm whether it stays out of scope for the first implementation or needs a stub persistence path during Task 1.
- If frontend or AI chat needs mission template titles and descriptions immediately, confirm whether any existing response DTOs must expose the new metadata as part of the same implementation slice.
