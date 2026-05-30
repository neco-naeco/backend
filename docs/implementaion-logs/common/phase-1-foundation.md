## [2026-05-21] C1: Scaffold application and infrastructure baseline

**Plan reference:** `docs/plans/common-sequential-plan.md`

**Summary:**
- NestJS 프로젝트 초기 스캐폴드를 생성하고, 스펙이 정의한 소스 레이아웃(`src/`, `database/`, `integrations/`, `shared/`, `modules/`), Docker Compose 인프라(app/postgres/redis), 환경 로딩 기반(JWT/DB/Redis/LLM/runtime config namespace)을 확립했습니다.

**Dependencies reviewed before starting:**
- `docs/plans/common-sequential-plan.md` — Task C1 acceptance criteria
- `docs/specs/01-architecture.md` — Docker Compose 서비스 구성 및 런타임 경계 규칙
- `docs/specs/03-modules.md` — 소스 레이아웃 계약, 모듈 내부 구조 규칙
- `docs/specs/07-integrations-and-ai.md` — Confirmed Docker Model, LLM/Redis/WebSocket 역할 정의

**Implementation details:**
- `package.json`: pnpm, NestJS 11, TypeORM 0.3.20, TypeScript 6 기반으로 설정. `build`, `dev`, `typecheck`, `lint`, migration 스크립트 포함.
- `tsconfig.json`: `commonjs`, `emitDecoratorMetadata`, `experimentalDecorators` 활성화. path alias(`@common/`, `@database/`, `@integrations/`, `@shared/`, `@modules/`) 설정. `rootDir: ./src`, `ignoreDeprecations: "6.0"` (TypeScript 6 baseUrl deprecation 억제).
- `src/app.module.ts`: `ConfigModule.forRoot({ isGlobal: true })` 으로 6개 config namespace(app/database/jwt/redis/llm/runtime)를 전역 로드.
- `src/database/database.module.ts`: `TypeOrmModule.forRootAsync` + `ConfigService`로 DB 접속. `synchronize: false` 기본값(마이그레이션 전용).
- `src/database/data-source.ts`: TypeORM CLI 마이그레이션 실행용 독립 DataSource. `dotenv.config()` 직접 호출.
- `integrations/`: jwt/redis/llm/runtime/websocket/mq 어댑터 스텁 모듈 생성. 구현은 각 Worker 스트림에서 담당.
- `modules/`: auth/ai-chat-sessions/game-rooms/game-room-participants/game-room-missions/turns/executions/mission-results/realtime 9개 도메인 모듈 스텁 생성. 각 모듈에 `controller/`, `service/`, `entity/` 디렉터리(`.gitkeep`) 포함. realtime은 `gateway/` 포함.
- `docker-compose.yml`: `app`(docker.sock 마운트), `postgres:16-alpine`, `redis:7-alpine` 3서비스 구성. 헬스체크 조건부 depends_on 설정.
- `Dockerfile`: 멀티스테이지(base → deps → build → production). production stage는 `dist/` + prod 의존성만 포함.
- `.env.example`: JWT/DB/Redis/LLM/Runtime 전체 환경변수 템플릿 제공.

**Files changed:**
- `package.json`
- `tsconfig.json`, `tsconfig.build.json`, `nest-cli.json`
- `src/main.ts`
- `src/app.module.ts`
- `src/common/config/app.config.ts`
- `src/common/config/database.config.ts`
- `src/common/config/jwt.config.ts`
- `src/common/config/redis.config.ts`
- `src/common/config/llm.config.ts`
- `src/common/config/runtime.config.ts`
- `src/common/index.ts`
- `src/database/database.module.ts`
- `src/database/data-source.ts`
- `src/integrations/jwt/jwt.module.ts`
- `src/integrations/redis/redis.module.ts`
- `src/integrations/llm/llm.module.ts`
- `src/integrations/runtime/runtime.module.ts`
- `src/integrations/websocket/websocket.module.ts`
- `src/integrations/mq/mq.module.ts`
- `src/modules/*/` (9개 모듈 스텁 + 각 내부 디렉터리)
- `src/shared/{enums,dto,interfaces,mappers}/` (C2 대기 스텁)
- `docker-compose.yml`
- `Dockerfile`
- `database/migrations/.gitkeep`, `database/seeds/.gitkeep`
- `.env.example`
- `.gitignore`, `.npmrc`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`

**Verification:**
- [x] `pnpm typecheck` (`tsc --noEmit`) — 통과
- [x] `pnpm build` (`nest build`) — 통과
- [x] 소스 레이아웃이 `docs/specs/03-modules.md` 계약과 일치함을 육안 검증
- [x] docker-compose.yml이 `app`/`postgres`/`redis` + `/var/run/docker.sock` 마운트를 포함함을 검증
- [x] 6개 config namespace(app/database/jwt/redis/llm/runtime)가 `ConfigModule.forRoot`에 모두 로드됨 확인
- [ ] `pnpm lint` — ESLint 미설치 (C2에서 설정 예정). 현 시점 linter 미구성이 허용됨.
- [ ] Docker Compose 실제 구동 테스트 — `.env` 미설정으로 로컬 미실행. DB/Redis 접속은 C2 이후 실제 모듈 구현 시 검증.

**Commit:**
- `4f390a4` feat(scaffold): Task C1 - 애플리케이션 및 인프라 기반 스캐폴드 구성

**Impact on next tasks:**
- **C2 (공유 계약 및 퍼시스턴스 규약 확립)** 진입 가능: config namespace, TypeORM DataSource, 마이그레이션 경로(`database/migrations/`), 모듈 내부 구조가 준비됨.
- 각 Worker 스트림: `src/modules/{module}` 하위 `controller/`, `service/`, `entity/`에 직접 파일을 추가하면 됨. 모듈 스텁에 `@Module({})` 선언만 있으므로 각 Worker가 imports/providers/exports를 채우면 됨.
- `src/app.module.ts`에 도메인 모듈 import 추가는 C2 또는 각 Worker 착수 시점에 수행.

**Design decisions made:**
- **TypeORM 0.3.x 선택**: 설치 시 1.0.0이 기본 해석되었으나 0.3.20으로 명시 고정. 0.3.x가 현행 안정 버전이며 NestJS 11과 호환.
- **`synchronize: false` 기본값**: 데이터 안전을 위해 마이그레이션 전용으로 고정. 개발 환경도 `DB_SYNCHRONIZE=true` 환경변수로만 활성화 가능.
- **모듈 스텁 comment 유지**: 각 Worker가 모듈 책임과 의존성을 확인할 수 있도록 스펙 요약 comment를 `.module.ts`에 포함.
- **`ignoreDeprecations: "6.0"`**: TypeScript 6에서 `baseUrl` deprecated 경고를 억제. path alias는 C2에서 검토 후 필요 시 `moduleResolution: bundler`로 전환 가능.

**Deviations from spec:**
- 없음. 모든 구성이 `docs/specs/01-architecture.md`, `03-modules.md`, `07-integrations-and-ai.md`와 일치함.

**Trade-offs:**
- **통합 모듈 vs 스텁 분리**: 스텁 모듈만 생성하고 실제 구현은 각 Worker에게 위임. 대안(처음부터 상세 구현)은 Worker 스트림과 충돌 위험이 있으므로 채택하지 않음.
- **Redis 헬스체크 조건부 처리**: `REDIS_PASSWORD` 설정 시 `redis-cli ping`이 실패하는 문제를 `CMD-SHELL`로 조건 분기하여 해결.

**Open questions:**
- [x] TypeORM `synchronize: false`가 모든 환경에서 적용되는가? → Yes, 명시적으로 `DB_SYNCHRONIZE=true` 환경변수로만 활성화.
- [ ] ESLint 설정은 C2에서 추가할 예정인가? → C2 담당자가 결정 필요. `pnpm lint` 스크립트는 준비되어 있음.

**Open risks or follow-ups:**
- `dist/` 빌드 결과물이 `.gitignore`에 포함되어 git 추적 제외됨. Dockerfile이 이를 빌드 스테이지에서 생성하므로 문제 없음.
- `tsconfig.tsbuildinfo` / `tsconfig.build.tsbuildinfo`도 ignore 처리됨.
- 마이그레이션 파일은 아직 없음. C2에서 첫 번째 마이그레이션(초기 테이블 생성)이 추가될 예정.

**Instructions for the next worker:**
- C2 진입 전 이 로그를 읽고 config namespace 이름(`database`, `jwt`, `redis`, `llm`, `runtime`)을 `ConfigService.get<T>('namespace.key')` 패턴으로 활용할 것.
- 새 도메인 모듈 구현 시 `src/modules/{module-name}/{module-name}.module.ts` 스텁에 imports/providers/exports를 추가하면 됨.
- 새 모듈을 앱에 등록하려면 `src/app.module.ts`의 `imports` 배열에 추가할 것.
- 마이그레이션 생성: `pnpm migration:generate -- database/migrations/<MigrationName>` 실행.
- ~~ESLint 미설정 상태~~ → C2에서 ESLint 10 flat config 설정 완료. `pnpm lint` 사용 가능.
- 실제 Docker Compose 실행 시 `.env.example`을 `.env`로 복사하고 시크릿 값을 채워야 함.

---

## [2026-05-21] C2: 공유 계약 및 퍼시스턴스 규약 확립

**Plan reference:** `docs/plans/common-sequential-plan.md`

**Summary:**
- API 응답 래퍼(RequestId + `{ data, meta, error }` 형식), 전역 예외 필터, 전체 도메인 Enum, BaseEntity, Asia/Seoul 타임스탬프 유틸, ESLint 설정을 확립했습니다.

**Dependencies reviewed before starting:**
- `docs/plans/common-sequential-plan.md` — Task C2 acceptance criteria
- `docs/specs/05-api-and-realtime.md` — 응답 래퍼 형식, 도메인 Enum 목록
- `docs/specs/04-data-model.md` — 상태값 저장 규약, Enum 정의, BaseEntity 설계 기준
- `docs/specs/03-modules.md` — common/shared 레이어 책임 범위
- `docs/implementaion-logs/common/phase-1-foundation.md` (C1 로그) — ESLint 미설정 open question 확인

**Implementation details:**

- **`src/shared/enums/`**: 스펙 정의 전체 Enum을 5개 파일로 분리. 파일별 책임:
  - `game-room.enum.ts`: `GameRoomStatus`, `GameRoomParticipantMembershipStatus`, `GameRoomParticipantRole`
  - `turn.enum.ts`: `TurnStatus`
  - `mission.enum.ts`: `GameRoomMissionStepStatus`
  - `execution.enum.ts`: `ExecutionStatus`
  - `ai-chat.enum.ts`: `AiChatRequestType`, `AiChatRequestStatus`, `AiChatMessageSenderType`, `AiChatMessageType`, `AiRealtimeEventType`
  - `index.ts`: barrel export
- **`src/common/types/api-response.type.ts`**: `ApiMeta`, `ApiError`, `ApiResponse<T>` 인터페이스 정의. 스펙의 `{ data, meta: { requestId }, error }` 형식과 일치.
- **`src/common/interceptors/response.interceptor.ts`**: 요청마다 UUID requestId 생성 → request 객체에 주입 → 성공 응답을 `ApiResponse` 형식으로 래핑. `@types/express` v5 breaking change(`StatusCode` 타입) 우회를 위해 NestJS `getRequest<{ requestId?: string }>()` 제네릭 방식 사용.
- **`src/common/filters/http-exception.filter.ts`**: 모든 예외를 `ApiResponse` 에러 형식으로 통일. ValidationPipe 배열 메시지 정규화, 도메인 커스텀 `code` 우선 적용, `HttpStatus` 역방향 조회로 errorCode 파생. `getResponse<any>()`로 @types/express v5 StatusCode 타입 이슈 우회.
- **`src/database/base.entity.ts`**: TypeORM `@PrimaryGeneratedColumn('uuid')` + `@CreateDateColumn` / `@UpdateDateColumn` (`timestamptz`) abstract class. `!` 단언 사용(`strictPropertyInitialization` 우회, TypeORM이 런타임에 주입).
- **`src/common/utils/date.util.ts`**: `toSeoulIso(date: Date): string` — `Intl.DateTimeFormat` 기반 Asia/Seoul ISO 8601 직렬화 유틸. Worker 응답 DTO/매퍼에서 타임스탬프 직렬화 시 반드시 사용.
- **`src/main.ts`**: `app.setGlobalPrefix('v1')` 추가, `AllExceptionsFilter` → `ResponseInterceptor` → `ValidationPipe` 순서로 전역 등록.
- **`eslint.config.js`**: ESLint 10 flat config. `@typescript-eslint/recommended` 기반, `src/**/*.ts` 대상. `pnpm lint` 명령 동작 확인.

**Files changed:**
- `src/shared/enums/game-room.enum.ts` (신규)
- `src/shared/enums/turn.enum.ts` (신규)
- `src/shared/enums/mission.enum.ts` (신규)
- `src/shared/enums/execution.enum.ts` (신규)
- `src/shared/enums/ai-chat.enum.ts` (신규)
- `src/shared/enums/index.ts` (신규)
- `src/common/types/api-response.type.ts` (신규)
- `src/common/interceptors/response.interceptor.ts` (신규)
- `src/common/filters/http-exception.filter.ts` (신규)
- `src/common/utils/date.util.ts` (신규)
- `src/database/base.entity.ts` (신규)
- `src/common/index.ts` (수정 — 새 exports 추가)
- `src/main.ts` (수정 — v1 prefix, 전역 필터/인터셉터 등록)
- `eslint.config.js` (신규)
- `package.json` (수정 — eslint, @typescript-eslint devDeps 추가, lint script 업데이트)
- `pnpm-lock.yaml` (수정)

**Verification:**
- [x] `pnpm typecheck` — 통과
- [x] `pnpm build` — 통과
- [x] `pnpm lint` — 통과 (경고 없음)
- [x] Enum 값이 스펙과 정확히 일치하는지 육안 검증
- [x] GPT 5.4 서브에이전트 코드 리뷰 수행 — P1(`/v1` prefix 누락) 및 P2 이슈(예외 필터 배열 메시지 처리) 피드백 반영 완료
- [ ] 실제 DB 연결 통합 테스트 — DB 미실행 환경, C3 이후 Worker 구현 시 검증 예정

**Commit:**
- `9d28746` feat(common): Task C2 - 공유 계약 및 퍼시스턴스 규약 확립

**Impact on next tasks:**
- **Worker-1, Worker-2, Worker-3 진입 가능**: 공유 Enum, ApiResponse 타입, BaseEntity, ESLint 모두 준비됨.
- **공유 계약 체크포인트 충족**: C1-C2 완료, 세 Worker 스트림 독립 진행 가능 상태.
- 모든 Entity는 `BaseEntity`를 extend하여 uuid pk, `created_at`, `updated_at` 자동 관리.
- 모든 응답 DTO/매퍼에서 타임스탬프 필드는 `toSeoulIso()` 유틸로 직렬화해야 함.

**Design decisions made:**
- **`@types/express` v5 StatusCode 우회**: `Response<any>` 대신 `getResponse<any>()`를 사용. v5에서 `Response.status()`가 `StatusCode` 리터럴 유니언 타입을 요구하는 breaking change 대응. `HttpStatus`의 숫자값을 그대로 넘기면 타입 오류 발생.
- **requestId 전파 방식**: 서비스 계층 전파는 AsyncLocalStorage/CLS 기반이 이상적이지만, MVP 범위에서는 request 객체 주입으로 충분하다고 판단. 필요 시 Worker 스트림에서 CLS로 확장 가능.
- **deriveErrorCode**: `HttpStatus` enum의 역방향 조회(`Object.entries`)로 HTTP 상태 코드 → 에러 코드 문자열 파생. 커스텀 코드가 있으면 커스텀 우선.

**Deviations from spec:**
- 없음. 모든 Enum 값, 응답 형식이 스펙과 정확히 일치함.

**Trade-offs:**
- **requestId 전파 단순화**: 현재 request 객체 주입 방식은 HTTP 컨텍스트에서만 작동. 비동기 이벤트, WebSocket, 메시지 큐 컨텍스트에서는 별도 처리 필요. CLS(cls-hooked/AsyncLocalStorage) 도입은 Worker 스트림 착수 후 필요 시점에 결정.
- **Intl.DateTimeFormat 기반 Asia/Seoul 직렬화**: Node.js 내장 API 사용으로 외부 의존성 없음. 단, 밀리초(`.000`) 포함 여부와 포맷 정확도는 통합 테스트에서 확인 필요.

**Open questions:**
- [x] ESLint 설정 C2에서 추가하는가? → Yes, 완료.
- [ ] requestId를 서비스/로거 계층까지 전파할 필요가 있는가? → Worker 구현 진행 후 필요 시 AsyncLocalStorage 기반 CLS로 확장 결정.
- [ ] `toSeoulIso()` 유틸의 밀리초 포함 여부 — 프론트엔드 파싱 규약 확인 필요.

**Open risks or follow-ups:**
- Worker 스트림이 응답 DTO에서 Date 직렬화 시 `toSeoulIso()` 유틸을 빠뜨릴 위험 있음. class-transformer `@Transform` 데코레이터와 연계하는 가이드를 Worker 착수 전 공유 권장.
- `@types/express` v5 마이그레이션 상황에 따라 `getResponse<any>()` 우회 방식을 올바른 `StatusCode` 캐스팅으로 개선 가능.

**Instructions for the next worker:**
- Enum 사용 시 `src/shared/enums`에서 import (`@shared/enums` path alias 또는 상대경로).
- API 응답 DTO는 `ApiResponse<T>` 타입을 참조. 컨트롤러에서 직접 데이터 객체만 반환하면 `ResponseInterceptor`가 자동 래핑.
- 커스텀 HTTP 예외 생성 시 `new HttpException({ code: 'DOMAIN_ERROR_CODE', message: '...' }, HttpStatus.XXX)` 형식 사용 — `code` 필드가 응답 `error.code`로 전달됨.
- 새 Entity는 `src/database/base.entity.ts`의 `BaseEntity`를 extend하여 id/createdAt/updatedAt 자동 포함.
- 타임스탬프 응답 직렬화는 반드시 `toSeoulIso(date)` 유틸 사용 (`@common/utils/date.util` 또는 `@common`).
- 모든 HTTP 라우트는 `/v1` 프리픽스가 자동 적용됨 (`main.ts`의 `setGlobalPrefix('v1')`).
- 마이그레이션 생성: `pnpm migration:generate -- database/migrations/<MigrationName>`.

---

## [2026-05-30] Task 1: Align schema and entities with calculator mission metadata

**Plan reference:** `docs/plans/calculator-mission-template-runtime-judging-plan.md`

**Summary:**
- 계산기 미션 템플릿과 6단계 플로우를 저장할 수 있도록 미션 템플릿/스텝 엔티티와 스키마 메타데이터를 ERD 용어에 맞춰 보강했습니다.
- `docker_images` 테이블을 TypeORM 엔티티로 모델링하고 `mission_templates.docker_image_id` 관계를 명시했습니다.

**Dependencies reviewed before starting:**
- `docs/plans/calculator-mission-template-runtime-judging-plan.md` — Task 1 acceptance criteria
- `docs/specs/02-domain-model.md` — Mission Template, Mission Template Step, Docker Image 용어와 런타임 이미지 참조 규칙
- `docs/specs/04-data-model.md` — snake_case 컬럼, jsonb payload, ERD 보존 규칙
- `docs/etc/erd.md` — `mission_templates`, `mission_template_steps`, `docker_images` 필드 계약
- `docs/implementaion-logs/common/phase-1-foundation.md` — C1/C2 로그와 미해결 질문 확인

**Implementation details:**
- `MissionTemplateEntity`에 `title`, `description`, `language`, `defaultTimeLimitSeconds`, `defaultMaxStrikeCount`, `successCriteria`를 추가했습니다.
- `MissionTemplateEntity`가 `DockerImageEntity`를 `ManyToOne`으로 참조하도록 `docker_image_id` 관계를 명시했습니다.
- `MissionTemplateStepEntity`에 `title`, `description`, human-readable `successCriteria`, ERD의 `judgePolicyJson`을 추가했습니다.
- 기존 `success_criteria_json` 컬럼은 데이터 손실을 피하기 위해 삭제하지 않고 `select: false` legacy 컬럼으로 남겼습니다.
- 보정 마이그레이션은 기존 테이블에 필요한 새 컬럼만 추가하고 rollback 시 추가 컬럼만 제거합니다.

**Files changed:**
- `src/modules/docker-images/entity/docker-image.entity.ts`
- `src/modules/game-room-missions/entity/mission-template.entity.ts`
- `src/modules/game-room-missions/entity/mission-template-step.entity.ts`
- `database/migrations/1779780000000-AlignCalculatorMissionTemplateMetadata.ts`
- `src/modules/game-room-missions/service/game-room-missions.service.spec.ts`
- `src/modules/turns/service/turns.service.spec.ts`
- `docs/implementaion-logs/common/phase-1-foundation.md`

**Verification:**
- [x] `pnpm test -- src/modules/game-room-missions/service/game-room-missions.service.spec.ts`
- [x] `pnpm typecheck`
- [x] `pnpm exec eslint src/modules/docker-images/entity/docker-image.entity.ts src/modules/game-room-missions/entity/mission-template.entity.ts src/modules/game-room-missions/entity/mission-template-step.entity.ts`
- [x] GPT 5.4 subagent review — P1/P2 피드백 반영 후 재리뷰에서 remaining findings 없음
- [x] Manual check: 엔티티와 마이그레이션 필드가 `docs/specs/02-domain-model.md`, `docs/specs/04-data-model.md`, `docs/etc/erd.md`의 명명과 관계에 맞는지 확인
- [ ] Full `pnpm lint` — 기존 범위 밖 이슈로 실패: `src/modules/realtime/service/realtime-room-state.service.ts` unused import, `src/modules/turns/service/turns.service.ts` empty interface 및 unused helper

**Commit:**
- `83c0c45` feat(mission): 계산기 미션 메타데이터 스키마 추가

**Impact on next tasks:**
- Task 2는 `docker_images`, `mission_templates`, `mission_template_steps` seed를 새 메타데이터 필드에 맞춰 작성할 수 있습니다.
- Task 3는 `mission_templates.docker_image_id`에서 `DockerImageEntity`를 통해 구체적인 runtime image metadata를 조회할 수 있습니다.

**Design decisions made:**
- `docker_image_deployments`는 이번 Task 1 acceptance에 없고 런타임 배포 이력은 계산기 MVP의 시드/실행 경로에 필요하지 않아 추가하지 않았습니다.
- 기존 `success_criteria_json`은 ERD의 human-readable `success_criteria`와 별개로 보존했습니다. 삭제 마이그레이션은 기존 데이터 손실 가능성이 있어 이번 범위에서 제외했습니다.

**Deviations from spec:**
- `mission_template_steps.success_criteria_json` legacy 컬럼이 일시적으로 남아 있습니다. ERD의 신규 human-readable `success_criteria`와 `judge_policy_json`은 추가했으며, legacy 컬럼 제거 여부는 별도 데이터 마이그레이션 결정이 필요합니다.

**Trade-offs:**
- 기존 컬럼을 즉시 제거하면 ERD와 더 깨끗하게 맞지만 rollback과 기존 데이터 보존이 취약합니다. Task 1은 안전한 스키마 확장을 우선했습니다.

**Open questions:**
- [x] `docker_image_deployments`를 Task 1에 포함해야 하는가? → No. 계산기 MVP Task 1 acceptance는 `docker_images` persistence와 `mission_templates.docker_image_id` 관계까지만 요구합니다.
- [ ] `mission_template_steps.success_criteria_json` legacy 컬럼을 언제 제거할 것인가? → 데이터 백필/호환성 정책을 정한 뒤 별도 마이그레이션으로 처리해야 합니다.

**Open risks or follow-ups:**
- Task 2 seed 작성 시 `mission_template_steps.judgePolicyJson`과 루트 `mission_templates.judgePolicyJson`의 책임 분리를 다시 확인해야 합니다. 현재 계획은 public test case bundle을 루트 judge policy에 둡니다.
- Full lint는 기존 unrelated 이슈가 있어 통과하지 못했습니다.

**Instructions for the next worker:**
- Task 2 시작 시 이 로그와 `database/migrations/1779780000000-AlignCalculatorMissionTemplateMetadata.ts`를 먼저 읽을 것.
- 계산기 seed에는 `mission_templates.title`, `description`, `language`, `successCriteria`, `defaultTimeLimitSeconds`, `defaultMaxStrikeCount`를 반드시 채울 것.
- 스텝 seed에는 `title`, `description`, `successCriteria`, `targetFilePath`, `hintText`, `judgePolicyJson`을 반드시 채울 것.
- `successCriteriaJson` legacy 컬럼에 새 seed 데이터를 의존시키지 말 것.

---

## [2026-05-30] Task 2: Add seed infrastructure and calculator mission seed data

**Plan reference:** `docs/plans/calculator-mission-template-runtime-judging-plan.md`

**Summary:**
- 계산기 미션용 repository seed 파일 3개(`docker_images`, `mission_templates`, `mission_template_steps`)를 추가했습니다.
- 애플리케이션 부트스트랩에서 도커 이미지, 미션 템플릿, 6개 미션 스텝을 트랜잭션으로 upsert하는 `MissionSeedService`를 추가했습니다.

**Dependencies reviewed before starting:**
- `docs/plans/calculator-mission-template-runtime-judging-plan.md` — Task 2 acceptance criteria
- `docs/specs/00-overview.md` — source hierarchy and conflict policy
- `docs/specs/02-domain-model.md` — Mission Template, Mission Template Step, Docker Image domain terms
- `docs/specs/04-data-model.md` — snake_case persistence and jsonb payload rules
- `docs/specs/06-gameplay-lifecycle.md` — game start and turn judgment flow context
- `docs/specs/07-integrations-and-ai.md` — Docker runtime lifecycle and server authority boundary
- `docs/implementaion-logs/README.md` — logging and task completion contract
- `docs/implementaion-logs/common/phase-1-foundation.md` — Task 1 handoff and open question review

**Implementation details:**
- `database/seeds/docker_images.json`에 단일 Python runner image reference를 추가했습니다.
- `database/seeds/mission_templates.json`에 Python-only, prompt-free stdin flow, `stdout.trim()` exact comparison, stderr empty, exit code 0 기준의 calculator judge policy를 추가했습니다.
- `judgePolicyJson.steps[]`에는 step order별 public test case bundle을 두고, 후속 step이 이전 연산 회귀를 잡도록 cumulative case를 포함했습니다.
- `projectStructureJson.files`에는 writable `main.py` skeleton과 read-only `README.md`를 포함했습니다.
- `database/seeds/mission_template_steps.json`에는 6개 단계의 title, description, target file, success criteria, hint text, step judge policy reference를 추가했습니다.
- `MissionSeedService`는 `docker_images` → `mission_templates` → `mission_template_steps` 순서로 한 트랜잭션 안에서 upsert합니다.
- 재시드 시 기존 logical step(`missionTemplateId`, `stepOrder`)의 primary key를 바꾸지 않아 live `game_room_mission_steps` FK를 깨지 않도록 했습니다.
- 미션 seed 실패는 필수 런타임 기준 데이터 누락이므로 로그 후 rethrow하여 bootstrap failure로 노출합니다.

**Files changed:**
- `database/seeds/docker_images.json`
- `database/seeds/mission_templates.json`
- `database/seeds/mission_template_steps.json`
- `src/modules/game-room-missions/game-room-missions.module.ts`
- `src/modules/game-room-missions/service/mission-seed.service.ts`
- `src/modules/game-room-missions/service/mission-seed.service.spec.ts`

**Verification:**
- [x] `pnpm test -- src/modules/prompt-template/prompt-template-seed.service.spec.ts`
- [x] `pnpm test -- src/modules/game-room-missions/service/game-room-missions.service.spec.ts src/modules/game-room-missions/service/mission-seed.service.spec.ts`
- [x] `pnpm typecheck`
- [x] `pnpm exec eslint src/modules/game-room-missions/service/mission-seed.service.ts src/modules/game-room-missions/game-room-missions.module.ts`
- [x] Manual JSON parse and seed shape check: 1 docker image, 1 mission template, 6 steps, `main.py` writable, `README.md` read-only, exact calculator error strings present
- [x] GPT 5.4 subagent review — initial findings on step PK rewrite, cumulative division case coverage, fail-fast bootstrap, and idempotence test coverage were fixed; re-review reported no blocking findings

**Commit:**
- `f87ada2` feat(mission): 계산기 미션 시드 추가

**Impact on next tasks:**
- Task 3 can resolve `mission_templates.docker_image_id` to the seeded Python runner image metadata.
- Task 5 can read public per-step cases from `mission_templates.judge_policy_json.steps[]`.
- Calculator mission startup now depends on seed import succeeding during application bootstrap.

**Design decisions made:**
- Mission seed bootstrap fails fast instead of swallowing seed errors. This differs from prompt-template cache seeding because calculator mission records are required runtime baseline data, not optional prompt cache refresh support.
- Step seed upsert preserves existing logical row IDs when a row already exists for `(missionTemplateId, stepOrder)` to avoid breaking historical/live room mission step references.
- Public test case bundles are stored at the mission template root and step records reference their bundle by `stepOrder`, matching the plan’s root `judgePolicyJson` direction while keeping step metadata human-readable.

**Deviations from spec:**
- None for Task 2. The Task 1 legacy `mission_template_steps.success_criteria_json` column remains outside this task’s scope and is populated with compatibility metadata by the seed service.

**Trade-offs:**
- Seed records use stable UUIDs committed in JSON rather than generated IDs. This keeps local, test, and future environment baselines deterministic.
- The calculator cases intentionally stay small and public-only. Hidden tests or flexible grading were excluded to preserve the MVP scope and server-side deterministic judging contract.

**Open questions:**
- [x] Should mission seed bootstrap continue on import failure like prompt-template seeding? → No. Calculator mission data is required for runtime selection and judging, so fail-fast is safer.
- [ ] When should legacy `mission_template_steps.success_criteria_json` be removed? → Still unresolved from Task 1; not required for Task 2.

**Open risks or follow-ups:**
- Task 3 must map the seeded `DockerImageEntity.imageUri` to runtime container preparation without hardcoding image strings elsewhere.
- Task 5 must use `stdout.trim()` exact comparison and require empty stderr to preserve the seed’s comparison policy.

**Instructions for the next worker:**
- Read `database/seeds/mission_templates.json` before implementing runtime preparation or judging; it is now the canonical calculator mission contract.
- Preserve `judgePolicyJson.steps[].testCases[].stdinLines` and `expectedStdout` shapes when wiring Task 5.
- Do not rewrite existing `mission_template_steps.id` values during future seed updates; use logical step identity for updates.
