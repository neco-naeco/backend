## [2026-05-22] W1-3: Implement AI intent parsing and internal command mapping

**Plan reference:** `docs/plans/worker-1-auth-and-ai-chat-plan.md`

**Summary:**
- `POST /v1/ai-chat-sessions/{aiChatSessionId}/messages`에 LLM 기반 intent 파싱·검증·내부 command DTO 매핑을 연결했습니다.
- 지원 `requestType` 5종만 허용하며, W1-3에서는 downstream room/participant 서비스를 호출하지 않고 `commandResult.status = PENDING`만 반환합니다.
- 미션 템플릿 자연어 선택은 별도 `clientAction` 없이 `ROOM_CREATE` + `missionTemplateTitle` 경로로 처리합니다.
- 1~3차 리뷰 반영(휴리스틱·이력 보존·400 계약·트랜잭션 분리·`llmRaw` 저장)을 단일 작업 커밋 `48d5023`에 amend로 포함했습니다.

**Dependencies reviewed before starting:**
- `docs/implementaion-logs/README.md`
- `docs/implementaion-logs/worker-1/phase-1-auth.md` — Task W1-2 (open questions 확인)
- `docs/plans/worker-1-auth-and-ai-chat-plan.md` — Task W1-3
- `docs/specs/07-integrations-and-ai.md`, `05-api-and-realtime.md`, `03-modules.md`, `02-domain-model.md`
- `docs/etc/api-spec.md` — §9 POST messages

**Implementation details:**
- **`src/shared/dto/ai-chat-command.dto.ts`**: C3 연동용 discriminated union `AiChatCommandDto` 5종 + `AiChatCommandResultDto`/`AiChatCommandResultStatus`.
- **`src/integrations/llm/`**: `LlmIntentParserService` — OpenAI 호환 JSON API, 키 없음/실패 시 휴리스틱 fallback. `isInviteAcceptance`가 `USER_INVITE`보다 우선. 미션 선택 문장은 `ROOM_CREATE` + `missionTemplateTitle`.
- **`src/modules/ai-chat-sessions/intent/`**: `AiChatIntentValidator`(unsupported는 throw 대신 `outcome: 'unsupported'`), `AiChatCommandResultMapper`(W1-3는 전부 `PENDING`), `buildCommandAssistantContent`.
- **`createMessage` 트랜잭션 경계**:
  1. tx1 — `UNPARSED`/`RECEIVED` request + user `TEXT` 저장
  2. tx 밖 — `parseUserMessage()` (최대 30s, DB 락 없음)
  3. unsupported — tx2에서 `FAILED` 이력 + `llmRaw` 저장 후 `400 AI_CHAT_COMMAND_NOT_SUPPORTED`
  4. ambiguous — tx2에서 `FAILED` + assistant `TEXT` + nominal `ROOM_CREATE` `commandResult`(HTTP 200, parse 실패 UI)
  5. success — tx2에서 `COMPLETED` + `COMMAND_RESULT` assistant + `PENDING` `commandResult`
- **unsupported 저장 payload** (`responsePayload` / `requestPayload.llmRaw`):
  - `parseOutcome`, `errorCode`, `rawRequestType`, `llmRaw`(전체 `requestType`/`payload`/`confidence`/`assistantHint`)
- **`AI_CHAT_COMMAND_NOT_SUPPORTED`**: `ai-chat-error.constants.ts`에 추가. HTTP 400은 unsupported만; ambiguous는 200 `FAILED` 본문 유지.

**Files changed:**
- `src/integrations/llm/llm-intent-parser.port.ts`
- `src/integrations/llm/llm-intent-parser.service.ts`
- `src/integrations/llm/llm-intent-parser.service.spec.ts`
- `src/integrations/llm/llm.module.ts`
- `src/modules/ai-chat-sessions/ai-chat-sessions.service.ts`
- `src/modules/ai-chat-sessions/ai-chat-sessions.service.spec.ts`
- `src/modules/ai-chat-sessions/ai-chat-sessions.module.ts`
- `src/modules/ai-chat-sessions/constants/ai-chat-error.constants.ts`
- `src/modules/ai-chat-sessions/intent/ai-chat-assistant-content.ts`
- `src/modules/ai-chat-sessions/intent/ai-chat-command-result.mapper.ts`
- `src/modules/ai-chat-sessions/intent/ai-chat-command-result.mapper.spec.ts`
- `src/modules/ai-chat-sessions/intent/ai-chat-intent.validator.ts`
- `src/modules/ai-chat-sessions/intent/ai-chat-intent.validator.spec.ts`
- `src/shared/dto/ai-chat-command.dto.ts`
- `src/shared/dto/index.ts`

**Verification:**
- [x] `pnpm typecheck` — 통과
- [x] `pnpm test` — 39 tests 통과 (W1-3 관련: llm-intent-parser 5, intent validator 7, ai-chat-sessions 8 등)
- [x] 1차 리뷰: invite 수락 vs 초대 휴리스틱, 미션 선택 fallback, 파싱 전 user/request 이력 저장
- [x] 2차 리뷰: unsupported `400` 계약 복구, LLM 호출 트랜잭션 밖 분리 (`tx → llm → tx` 순서 테스트)
- [x] 3차 리뷰: unsupported 경로 `llmRaw` 전체 저장 검증
- [ ] `pnpm lint` / `pnpm build` — 이번 로그 작성 시점에 재실행하지 않음(직전 작업 세션에서 통과)
- [ ] `pnpm migration:run` — 로컬 Postgres 미기동으로 미실행
- [ ] HTTP 수동 스모크 — DB·LLM 키 미연결로 미실행

**Commit:**
- `48d5023` feat(ai-chat): Task W1-3 AI intent 파싱 및 command DTO 매핑

**Impact on next tasks:**
- **Task W1-4 진입 가능**: intent·command DTO·assistant metadata 골격 준비됨. W1-4는 prompt-template·풍부한 follow-up 문안·LLM 피드백 실패 fallback에 집중.
- **Task C3**: `src/shared/dto/ai-chat-command.dto.ts`를 room/participant 서비스 호출 입력으로 사용. W1-3 `PENDING` `commandResult`를 C3에서 `SUCCESS`/`FAILED`로 갱신 예정.
- **POST 동작 변경**: W1-2의 `RECEIVED` + `intentParsingPending` 동기 응답은 W1-3에서 제거됨. 프론트는 §9 `COMPLETED`/`FAILED`/`400` 분기만 사용.

**Design decisions made:**
- **동기 파싱 단일 응답**: MVP POST 한 번에 파싱 완료. 비동기 `RECEIVED` 유지하지 않음(W1-2 중립 응답 종료).
- **W1-3 무 downstream mutation**: authoritative state는 C3·Worker 2 서비스만 변경.
- **ambiguous vs unsupported 분리**: ambiguous → HTTP 200 `FAILED`(nominal `ROOM_CREATE`로 §9 `requestType` 필수 충족). unsupported → 이력 저장 후 HTTP `400`(프론트 unsupported 구분 가능).
- **휴리스틱 fallback**: `LLM_API_KEY` 없거나 API 실패 시 로컬·CI 테스트 가능.

**Deviations from spec:**
- 없음(의도적 계약: ambiguous parse 실패는 200 `FAILED` 본문, unsupported만 400 — api-spec `AI_CHAT_COMMAND_NOT_SUPPORTED` 및 §9 UI 규칙 정합).

**Trade-offs:**
- **ambiguous `requestType` placeholder**: `ROOM_CREATE` nominal은 parse 실패 전용이며 실제 room-create 명령이 아님. C3/프론트는 `parseOutcome: 'ambiguous'` metadata와 assistant `TEXT`로 구분할 것.
- **단일 amend 커밋**: 리뷰 1~3차 수정이 `48d5023` 하나에 포함. 작업 커밋과 본 로그 커밋은 분리.

**Open questions:**
- [x] W1-2 “W1-3에서 UNPARSED → 파싱 갱신” → `createMessage`에서 `COMPLETED`/`FAILED`로 갱신 규칙 구현 완료.
- [ ] C2 `requestId` 서비스/로거 전파 — W1-3에서 interceptor UUID만 사용, 후속 가능.
- [ ] C2 `toSeoulIso()` 밀리초 포함 여부 — W1-3 응답에도 동일 적용, 프론트 규약 확인은 후속.

**Open risks or follow-ups:**
- 실제 LLM 연동·Postgres 기동 후 POST messages HTTP integration test 1회 권장(unsupported 400 + history `llmRaw` 포함).
- W1-4에서 assistant 문안·prompt-template seed 연동 시 `buildCommandAssistantContent` 확장 예정.

**Instructions for the next worker:**
- W1-4 착수 전 `docs/specs/07-integrations-and-ai.md`·`docs/specs/08-security-testing-and-delivery.md` prompt-template 정책을 읽을 것.
- `AiChatCommandDto`·`AiChatCommandResultMapper` 시그니처는 C3 handoff를 위해 불필요한 변경 자제.
- unsupported 처리: `400 AI_CHAT_COMMAND_NOT_SUPPORTED` + DB `llmRaw` 저장 패턴 유지.
- `createMessage`는 `tx → llm → tx` 순서 유지(LLM을 트랜잭션 안에 넣지 말 것).

## [2026-05-22] W1-4: Implement AI follow-up messaging and prompt-template support

**Plan reference:** `docs/plans/worker-1-auth-and-ai-chat-plan.md`

**Summary:**
- seed 기반 `ai_prompt_templates` 테이블·부팅 upsert·캐시 모듈을 추가했습니다.
- intent 파싱 성공 시 명령 타입별 LLM follow-up을 생성하고, 실패 시 deterministic static fallback으로 assistant 메시지를 반환합니다.
- follow-up·clarification·static fallback 경로에서 unsafe `assistantHint`가 사용자 응답에 노출되지 않도록 `sanitizeFollowUpContent()` 정책을 통일했습니다.
- 1~2차 리뷰 수정은 작업 커밋 `95f6395` 하나에 amend로 포함했습니다(작업 커밋과 본 로그 커밋은 분리).

**Dependencies reviewed before starting:**
- `docs/implementaion-logs/README.md`
- `docs/implementaion-logs/worker-1/phase-2-intent-parsing.md` — Task W1-3 (open questions: C2 항목은 후속 유지)
- `docs/plans/worker-1-auth-and-ai-chat-plan.md` — Task W1-4
- `docs/specs/07-integrations-and-ai.md`, `03-modules.md`, `08-security-testing-and-delivery.md`, `06-gameplay-lifecycle.md`

**Implementation details:**
- **`database/migrations/1747843400000-AiPromptTemplates.ts`**, **`database/seeds/ai_prompt_templates.json`**: `template_key` 유니크, purpose `chat_command`. intent 1종 + follow-up 6종(방 생성, 초대, 수락/참가, 거절, 게임 시작, 미션·난이도 요약).
- **`src/modules/prompt-template/`**: `PromptTemplateSeedService` — seed import와 `refreshCache()` 분리(seed 실패해도 DB 활성 템플릿 캐시 로드). `PromptTemplateService` — `{{var}}` 렌더링·인메모리 캐시.
- **`src/integrations/llm/llm-follow-up.service.ts`**: `generateCommandFollowUp()` — 템플릿 렌더 → LLM(키 있을 때) → 실패 시 `buildSafeStaticFollowUpContent`(hint 미사용). `responsePayload.followUp: { source, templateKey }` 저장.
- **`LlmIntentParserService`**: DB `chat_intent_parse` 템플릿이 있으면 system prompt로 사용.
- **`ai-chat-assistant-content.ts`**: `sanitizeFollowUpContent` / `isUnsafeFollowUpContent`, `buildSafeStaticFollowUpContent`, `resolveClarificationAssistantContent`, `DEFAULT_CLARIFICATION_MESSAGE`.
- **`AiChatIntentValidator`**: `requestType: null` clarification에 `resolveClarificationAssistantContent(raw.assistantHint)` 적용.
- **`AiChatSessionsService.resolveCommandFollowUp`**: follow-up generator throw 시에도 static fallback으로 COMPLETED 흐름 유지.
- **room summary 템플릿**: `desiredDifficulty` + `missionTemplateTitle` 모두 있을 때만 `chat_followup_room_summary` 선택; seed/변수는 `userMessage`, `desiredDifficulty`, `missionTemplateTitle`만 사용(`participantCount`, `roomTitle` 제거).

**Files changed:**
- `database/migrations/1747843400000-AiPromptTemplates.ts`
- `database/seeds/ai_prompt_templates.json`
- `src/modules/prompt-template/` (entity, module, service, seed service, render helper, constants, specs)
- `src/integrations/llm/llm-follow-up.port.ts`
- `src/integrations/llm/llm-follow-up.service.ts`
- `src/integrations/llm/llm-follow-up.service.spec.ts`
- `src/integrations/llm/llm-intent-parser.service.ts`
- `src/integrations/llm/llm-intent-parser.service.spec.ts`
- `src/integrations/llm/llm.module.ts`
- `src/modules/ai-chat-sessions/ai-chat-sessions.service.ts`
- `src/modules/ai-chat-sessions/ai-chat-sessions.service.spec.ts`
- `src/modules/ai-chat-sessions/intent/ai-chat-assistant-content.ts`
- `src/modules/ai-chat-sessions/intent/ai-chat-assistant-content.spec.ts`
- `src/modules/ai-chat-sessions/intent/ai-chat-intent.validator.ts`
- `src/modules/ai-chat-sessions/intent/ai-chat-intent.validator.spec.ts`
- `src/app.module.ts`

**Verification:**
- [x] `pnpm typecheck` — 통과
- [x] `pnpm test` — 57 tests 통과 (follow-up fallback, unsafe hint clarification, seed cache-on-fail, room summary vars 등)
- [x] 1차 리뷰: fallback에서 unsafe `assistantHint` 차단, room summary 변수 정합, seed 실패 시 DB 캐시 분리
- [x] 2차 리뷰: clarification(`requestType: null`) 경로 unsafe hint → `DEFAULT_CLARIFICATION_MESSAGE`
- [ ] `pnpm lint` / `pnpm build` — 로그 작성 시점에 재실행하지 않음
- [ ] `pnpm migration:run` — 로컬 Postgres 미기동으로 미실행
- [ ] HTTP 수동 스모크 — DB·LLM 키 미연결로 미실행

**Commit:**
- `95f6395` feat(ai-chat): Task W1-4 follow-up·prompt-template 지원

**Impact on next tasks:**
- **Worker 1 Phase 2 완료**: auth(W1-1~2) + intent(W1-3) + follow-up(W1-4) 구현 완료. shared **Task C3** handoff 가능.
- **Task C3**: `AiChatCommandDto` + `PENDING` `commandResult`를 room/participant 서비스와 연결. authoritative mutation은 C3·Worker 2만 수행.
- **상태 변경 후 follow-up**: `chat_followup_room_summary`는 파싱 단계 미션·난이도 확인용. C3 이후 실제 방/참가자 요약이 필요하면 Worker 2·C3 데이터를 follow-up context로 넘기는 확장 검토.
- **마이그레이션**: 배포/로컬 DB에 `1747843400000-AiPromptTemplates` 실행 후 재기동 시 seed upsert 필요.

**Design decisions made:**
- **static fallback은 hint 제외**: LLM·템플릿 실패 시 `buildSafeStaticFollowUpContent`만 사용해 secret 유출면 최소화.
- **clarification과 follow-up 동일 sanitize**: `resolveClarificationAssistantContent`로 validator·assistant-content 정책 일원화.
- **follow-up 실패가 POST를 막지 않음**: generator 예외·LLM 실패 모두 assistant deterministic 문구로 COMPLETED/FAILED 본문 유지.
- **단일 amend 작업 커밋**: W1-4 초기 구현 + 리뷰 1~2차가 `95f6395`에 포함.

**Deviations from spec:**
- 없음(seed-driven 내부 관리, AI는 authoritative state 미변경, 실패 시 게임 진행 차단 없음 — `07-integrations-and-ai.md` 정합).

**Trade-offs:**
- **LLM follow-up은 POST 동기 호출**: intent 파싱과 동일하게 tx 밖에서 실행. C3 연동 후 지연·비용이 커지면 후속 분리 검토.
- **DB에 구 seed 텍스트 잔존 시**: 파일 수정만으로는 반영 안 됨 — 재기동 upsert 또는 수동 DB 갱신 필요.

**Open questions:**
- [ ] C2 `requestId` 서비스/로거 전파 — W1-3·W1-4 모두 interceptor UUID만 사용.
- [ ] C2 `toSeoulIso()` 밀리초 포함 여부 — W1-4 응답에도 동일, 프론트 규약 확인은 후속.

**Open risks or follow-ups:**
- Postgres 기동 + `migration:run` + 앱 재기동 후 prompt seed·POST messages HTTP 스모크 1회 권장.
- C3에서 command 실행 후 room/participant 요약 follow-up이 필요하면 별도 context DTO·템플릿 키 추가를 shared track과 조율.

**Instructions for the next worker:**
- C3 착수 전 `docs/plans/common-sequential-plan.md` Task C3, `src/shared/dto/ai-chat-command.dto.ts`, W1-3 로그의 `tx → llm → tx`·unsupported 400 패턴을 읽을 것.
- `createMessage` 트랜잭션 경계·`commandResult` API shape 변경은 shared 계약 합의 없이 하지 말 것.
- unsafe 사용자 노출 방지: assistant 문구는 `sanitizeFollowUpContent` / `resolveClarificationAssistantContent` / `buildSafeStaticFollowUpContent` 경로만 사용할 것.
