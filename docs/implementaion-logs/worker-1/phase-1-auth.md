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
