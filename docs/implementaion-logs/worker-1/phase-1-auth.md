## [2026-05-22] W1-1: Implement auth module and token lifecycle

**Plan reference:** `docs/plans/worker-1-auth-and-ai-chat-plan.md`

**Summary:**
- Auth 모듈 4개 엔드포인트(`check-nickname`, `signup`, `login`, `refresh-token`)를 구현했습니다.
- 클라이언트 `passwordHash`(SHA-256 hex)를 그대로 저장·검증하며, refresh token은 SHA-256 해시만 DB에 보관합니다.
- 회원가입 트랜잭션에서 사용자당 AI chat session 1개를 자동 생성합니다.
- JWT 발급은 `JwtIntegrationModule` + C1 JWT config를 사용합니다.
- 리뷰 반영으로 refresh token 회전을 트랜잭션 내 조건부 update로 원자화했고, 초기 마이그레이션에 `pgcrypto` 확장을 추가했습니다.

**Dependencies reviewed before starting:**
- `docs/implementaion-logs/README.md`
- `docs/implementaion-logs/common/phase-1-foundation.md` (C1, C2)
- `docs/plans/worker-1-auth-and-ai-chat-plan.md` — Task W1-1
- `docs/specs/05-api-and-realtime.md`, `04-data-model.md`, `08-security-testing-and-delivery.md`, `03-modules.md`
- `docs/etc/api-spec.md` — Auth 상세 계약

**Implementation details:**
- **`src/modules/auth/`**: `AuthController`, `AuthService`, DTO(`SignupDto`, `LoginDto`, `RefreshTokenDto`, `CheckNicknameQueryDto`), `User`/`RefreshToken` entity, `AUTH_ERROR` 상수.
- **`src/integrations/jwt/`**: `JwtTokenService` — access JWT 서명, opaque refresh token 생성, refresh token SHA-256 해시, `jwt.*` config 기반 만료 계산.
- **`src/modules/ai-chat-sessions/entity/ai-chat-session.entity.ts`**: signup 시 `ACTIVE` 세션 생성용. `requester_user_id` 유니크(MVP 1 user 1 session).
- **`database/migrations/1747843200000-InitialAuthAndAiChat.ts`**: `pgcrypto` 확장 → `users`, `refresh_tokens`, `ai_chat_sessions` 테이블. UUID default는 `gen_random_uuid()`.
- **Refresh 회전**: 단일 트랜잭션에서 `token_hash` 조회 → `revoked_at IS NULL` 조건부 update → `affected === 0`이면 `AUTH_REFRESH_TOKEN_REVOKED` (동시 재사용 차단) → 새 refresh/access 발급.
- **`POST /v1/auth/refresh-token`**: 성공 응답에 `accessToken` + `refreshToken` 모두 반환(문서 확정 스펙).
- **`src/app.module.ts`**: `JwtIntegrationModule`, `AuthModule` 등록.

**Files changed:**
- `database/migrations/1747843200000-InitialAuthAndAiChat.ts`
- `src/integrations/jwt/jwt.module.ts`
- `src/integrations/jwt/jwt-token.service.ts`
- `src/integrations/jwt/jwt-token.service.spec.ts`
- `src/modules/auth/auth.module.ts`
- `src/modules/auth/auth.service.ts`
- `src/modules/auth/auth.service.spec.ts`
- `src/modules/auth/controller/auth.controller.ts`
- `src/modules/auth/constants/auth-error.constants.ts`
- `src/modules/auth/dto/*.ts`
- `src/modules/auth/entity/user.entity.ts`
- `src/modules/auth/entity/refresh-token.entity.ts`
- `src/modules/ai-chat-sessions/entity/ai-chat-session.entity.ts`
- `src/app.module.ts`
- `package.json`, `pnpm-lock.yaml` (`@nestjs/jwt`)
- `tsconfig.json`, `tsconfig.build.json`, `tsconfig.spec.json`, `eslint.config.js`

**Verification:**
- [x] `pnpm typecheck` — 통과
- [x] `pnpm build` — 통과
- [x] `pnpm lint` — 통과
- [x] `pnpm test` — 14 tests 통과 (signup, login 실패, nickname 중복, refresh 회전, 동시 reuse 차단, AI session 자동/중복 방지, JWT 유틸)
- [x] 서브에이전트 리뷰 P1 2건 반영 (refresh 원자성, pgcrypto)
- [ ] `pnpm migration:run` — 로컬 Postgres 미기동으로 미실행. 마이그레이션 SQL은 `CREATE EXTENSION IF NOT EXISTS pgcrypto` 선행 포함.
- [ ] HTTP 수동 스모크 — DB 미연결로 미실행

**Commit:**
- `efe272b` feat(auth): Task W1-1 - auth 모듈 및 토큰 라이프사이클 구현
- `64378d8` fix(auth): W1-1 리뷰 반영 - refresh 회전 원자성 및 pgcrypto 확장

**Impact on next tasks:**
- **Task W1-2 진입 가능**: `AiChatSession` entity·테이블·`requester_user_id` 유니크 제약이 준비됨. `AuthModule`이 `TypeOrmModule.forFeature([AiChatSession])`를 export하므로 필요 시 import 가능.
- **Global JWT**: `JwtIntegrationModule`은 `@Global()` — W1-2 이후 access token 검증 guard 추가 시 재사용.
- **마이그레이션**: clean PostgreSQL에서 `pnpm migration:run` 전 `pgcrypto`가 migration `up()`에서 보장됨.

**Design decisions made:**
- **Opaque refresh token**: JWT refresh 대신 랜덤 hex + DB 해시 저장. 회전·폐기·one-time use를 DB 조건 update로 제어.
- **Signup 시 token 미발급**: API 계약상 signup 응답은 user 정보만. refresh token 저장은 login 시점에만 수행.
- **Nickname DB unique**: `AUTH_NICKNAME_CONFLICT` 지원을 위해 `users.nickname` 유니크 제약 추가(ERD에는 없었으나 API 계약 반영).
- **AiChatSession in auth transaction**: W1-2 모듈 완성 전 signup 일관성을 위해 auth 서비스가 직접 session row 생성.

**Deviations from spec:**
- 없음(리뷰 후 `refresh-token` 응답의 `refreshToken` 포함은 `docs/specs/05-api-and-realtime.md`, `docs/etc/api-spec.md`에 반영 완료).

**Trade-offs:**
- **Auth guard 미구현**: W1-1 범위는 public auth API만. Bearer 검증 guard는 W1-2 또는 공통 인증 레이어에서 추가 예정.
- **Migration CLI 스크립트**: `pnpm migration:run`이 shell wrapper 경로 이슈가 있을 수 있음. 대안: `pnpm exec ts-node -r tsconfig-paths/register ./node_modules/typeorm/cli.js migration:run -d src/database/data-source.ts`

**Open questions:**
- [x] refresh 응답에 `refreshToken` 포함 여부 → 문서 확정, 구현 일치.
- [ ] C2 `requestId` 서비스/로거 전파 — W1-1에서 미사용, 필요 시 후속.
- [ ] C2 `toSeoulIso()` 밀리초 포함 여부 — signup `createdAt`에 적용 중, 프론트 파싱 규약 확인은 후속.

**Open risks or follow-ups:**
- 로컬/CI에서 migration run + auth HTTP integration test는 Postgres 기동 후 1회 검증 권장.
- `pnpm migration:run` package script 경로 정리는 common 또는 infra 후속에서 개선 가능.

**Instructions for the next worker:**
- W1-2 착수 전 이 로그와 `docs/specs/05-api-and-realtime.md` AI chat 섹션을 읽을 것.
- `AiChatSession`은 `src/modules/ai-chat-sessions/entity/`에 있음. signup backfill 없이도 MVP에서는 가입 시 1 session 보장됨.
- 인증 예외 라우트: `auth/check-nickname`, `auth/signup`, `auth/login`, `auth/refresh-token`만 public.
- 커스텀 도메인 에러는 `throwAuthError` / `HttpException({ code, message }, status)` 패턴 유지.
- 타임스탬프 응답은 `toSeoulIso()` 사용.

## [2026-05-22] W1-2: Implement AI chat session read and message write flow

**Plan reference:** `docs/plans/worker-1-auth-and-ai-chat-plan.md`

**Summary:**
- AI chat 세션 목록·메시지 조회 및 메시지 POST API 3개를 구현했습니다.
- 전역 `JwtAuthGuard` + `@Public()`로 auth 4개 라우트를 제외한 Bearer 인증을 적용했습니다.
- `ai_chat_requests` / `ai_chat_messages` 마이그레이션·엔티티·트랜잭션 기반 메시지·요청 이력 저장을 추가했습니다.
- W1-3 전 POST는 `requestStatus: RECEIVED`이며 `requestType`을 생략합니다. DB에는 `UNPARSED` 내부 상수만 저장합니다.
- 3차 리뷰까지 반영해 `docs/etc/api-spec.md` §9·`docs/specs/05-api-and-realtime.md`에 RECEIVED 시 `requestType` 생략 계약을 명시했습니다.

**Dependencies reviewed before starting:**
- `docs/implementaion-logs/README.md`
- `docs/implementaion-logs/worker-1/phase-1-auth.md` — Task W1-1 (open questions 확인)
- `docs/plans/worker-1-auth-and-ai-chat-plan.md` — Task W1-2
- `docs/specs/05-api-and-realtime.md`, `04-data-model.md`, `03-modules.md`, `08-security-testing-and-delivery.md`
- `docs/etc/api-spec.md` — §5 GET ai-chat-sessions, §8 GET messages, §9 POST messages

**Implementation details:**
- **`src/common/guards/jwt-auth.guard.ts`**: `Authorization: Bearer` 검증, `@Public()` 스킵, `request.user`에 `userId`/`loginId` 설정. 만료 시 `AUTH_TOKEN_EXPIRED`, 그 외 `AUTH_TOKEN_INVALID`.
- **`src/modules/ai-chat-sessions/`**: `AiChatSessionsController`·`AiChatSessionsService`, DTO, `AI_CHAT_ERROR` / `AI_CHAT_REQUEST_TYPE_UNPARSED`(DB 전용).
- **`GET /v1/ai-chat-sessions`**: `requesterUserId = currentUser` 필터, optional `gameRoomId`/`userId`. 타인 `userId` → `403 FORBIDDEN_RESOURCE_ACCESS`. 세션 없으면 `[]`.
- **`GET .../messages`**: 소유 세션만 조회, 미소유/미존재 → `404 AI_CHAT_SESSION_NOT_FOUND`, 메시지 없으면 `[]`, `created_at` ASC.
- **`POST .../messages`**: 트랜잭션에서 request(`UNPARSED`, `RECEIVED`) → user `TEXT` → assistant `SYSTEM_NOTICE` → `source_message_id` FK 대상 설정. 응답은 api-spec §9 RECEIVED 예시 형태(`requestType` 생략, `commandResult: null`).
- **`database/migrations/1747843300000-AiChatRequestsAndMessages.ts`**: `ai_chat_requests`, `ai_chat_messages` 생성 후 `source_message_id` → `ai_chat_messages.id` FK(`ON DELETE SET NULL`), `(ai_chat_session_id, created_at)` 인덱스.
- **`src/app.module.ts`**: `AiChatSessionsModule` 등록, `APP_GUARD`로 `JwtAuthGuard` 적용.

**Files changed:**
- `database/migrations/1747843300000-AiChatRequestsAndMessages.ts`
- `docs/etc/api-spec.md`
- `docs/specs/05-api-and-realtime.md`
- `src/app.module.ts`
- `src/common/decorators/current-user.decorator.ts`
- `src/common/decorators/public.decorator.ts`
- `src/common/guards/jwt-auth.guard.ts`
- `src/common/guards/jwt-auth.guard.spec.ts`
- `src/common/types/authenticated-user.type.ts`
- `src/modules/ai-chat-sessions/ai-chat-sessions.module.ts`
- `src/modules/ai-chat-sessions/ai-chat-sessions.service.ts`
- `src/modules/ai-chat-sessions/ai-chat-sessions.service.spec.ts`
- `src/modules/ai-chat-sessions/constants/ai-chat-error.constants.ts`
- `src/modules/ai-chat-sessions/constants/ai-chat-internal.constants.ts`
- `src/modules/ai-chat-sessions/controller/ai-chat-sessions.controller.ts`
- `src/modules/ai-chat-sessions/dto/create-ai-chat-message.dto.ts`
- `src/modules/ai-chat-sessions/dto/list-ai-chat-sessions-query.dto.ts`
- `src/modules/ai-chat-sessions/entity/ai-chat-message.entity.ts`
- `src/modules/ai-chat-sessions/entity/ai-chat-request.entity.ts`
- `src/modules/auth/controller/auth.controller.ts` (`@Public()`)
- `src/shared/enums/ai-chat.enum.ts` (`AiChatSessionStatus` 추가)

**Verification:**
- [x] `pnpm typecheck` — 통과
- [x] `pnpm lint` — 통과
- [x] `pnpm build` — 통과
- [x] `pnpm test` — 29 tests 통과 (ai-chat-sessions 12, jwt-auth.guard 4, auth 13, jwt-token 4)
- [x] 3차 리뷰: POST `RECEIVED` 시 `requestType` 생략 계약을 api-spec·05 스펙에 반영 후 테스트·구현 정합
- [ ] `pnpm migration:run` — 로컬 Postgres 미기동으로 미실행
- [ ] HTTP 수동 스모크 — DB 미연결로 미실행

**Commit:**
- `4f721e0` feat(ai-chat): Task W1-2 AI 채팅 세션 조회·메시지 저장 API 구현

**Impact on next tasks:**
- **Task W1-3 진입 가능**: `AiChatRequest`/`AiChatMessage` 테이블·POST 트랜잭션 골격·JWT 가드 준비됨. W1-3는 `AI_CHAT_REQUEST_TYPE_UNPARSED` row를 파싱 후 공식 5종 `requestType` + `COMPLETED`/`FAILED` + `commandResult`로 갱신하면 됨.
- **스펙**: POST 성공 응답은 `RECEIVED`(무 `requestType`) vs `COMPLETED`/`FAILED`(필수 `requestType`) 구분이 문서화됨. W1-3 구현 시 §9 예시·05 규칙을 따를 것.
- **의존 서비스**: room/participant mutation은 W1-3 이후 downstream 호출. W1-2는 persistence·API만 담당.

**Design decisions made:**
- **전역 JWT guard**: 스펙상 auth 4개만 public. `@Public()` 메타데이터로 예외 처리.
- **DB `UNPARSED` vs API `requestType` 분리**: 공용 `AiChatRequestType` enum 5종 유지. 미해석 상태는 모듈 내부 상수만 DB에 저장하고 API에는 노출하지 않음.
- **POST W1-2 중립 응답**: `RECEIVED` + `requestType` 생략 + `commandResult: null`로 프론트 명령 UI 오동작 방지. assistant는 `SYSTEM_NOTICE` + `intentParsingPending` metadata.
- **`source_message_id` FK**: ERD 링크 무결성. messages 테이블 생성 후 ALTER로 순환 FK 해결.

**Deviations from spec:**
- 없음(3차 리뷰에서 `RECEIVED` 시 `requestType` 생략을 `docs/etc/api-spec.md` §9·`docs/specs/05-api-and-realtime.md`에 선행 반영).

**Trade-offs:**
- **Intent parsing 미구현**: W1-2 POST는 저장·중립 응답만. LLM·command DTO·`commandResult` 채움은 W1-3.
- **단일 amend 커밋**: 리뷰 1~3차 수정을 `4f721e0` 하나에 포함. 작업/로그 커밋은 분리.

**Open questions:**
- [x] W1-1 “Auth guard W1-2에서 추가” → W1-2에서 `JwtAuthGuard` 구현 완료.
- [ ] C2 `requestId` 서비스/로거 전파 — W1-2에서 interceptor UUID만 사용, 후속 가능.
- [ ] C2 `toSeoulIso()` 밀리초 포함 여부 — W1-2 응답에도 동일 적용, 프론트 규약 확인은 후속.

**Open risks or follow-ups:**
- `pnpm migration:run` + ai-chat HTTP integration test는 Postgres 기동 후 1회 권장(두 마이그레이션 순서: `1747843200000` → `1747843300000`).
- W1-3에서 `UNPARSED` → 파싱된 `request_type` 갱신 시 기존 RECEIVED row 처리 규칙을 서비스 레이어에 명시할 것.

**Instructions for the next worker:**
- W1-3 착수 전 `docs/etc/api-spec.md` §9 POST·`docs/specs/07-integrations-and-ai.md` LLM 경계를 읽을 것.
- `AI_CHAT_REQUEST_TYPE_UNPARSED`는 `ai-chat-internal.constants.ts`에만 두고 API enum에 다시 넣지 말 것.
- 파싱 성공 시 `requestStatus`/`requestType`/`commandResult`를 api-spec §9 COMPLETED 예시와 맞출 것.
- 소유권·에러 패턴: `requireOwnedSession`, `throwAiChatError`, `throwForbiddenAccess` 재사용.
- `JwtAuthGuard`·`toSeoulIso()`·응답 wrapper는 그대로 유지.
