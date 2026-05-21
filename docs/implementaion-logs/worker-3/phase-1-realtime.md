## [2026-05-21] W3-1: Implement authenticated realtime gateway and room join flow

**Plan reference:** `docs/plans/worker-3-realtime-runtime-execution-plan.md`

**Summary:**
- `join-room` 전용 realtime gateway foundation을 구현했습니다.
- canonical close code(`4401`, `4403`, `4404`) 처리, room-level session tracking, 초기 `room-participants-updated` 상태 relay, ws adapter/test 기반을 추가했습니다.
- 앱 전역 활성화는 의도적으로 보류했습니다. 실제 auth/room/disconnect 서비스가 연결되기 전까지 placeholder provider를 메인 앱에 노출하지 않도록 분리했습니다.

**Dependencies reviewed before starting:**
- `docs/plans/README.md` — worker 착수 전 read order 및 parallelization 규칙 확인
- `docs/plans/common-sequential-plan.md` — C1/C2 완료 여부와 shared contract freeze 확인
- `docs/plans/worker-3-realtime-runtime-execution-plan.md` — W3-1 acceptance criteria 및 verification scope 확인
- `docs/implementaion-logs/README.md` — task 단위 커밋/로그 분리 규칙 확인
- `docs/implementaion-logs/common/phase-1-foundation.md` — C1/C2 산출물, open question 비차단성 확인
- `docs/specs/05-api-and-realtime.md` — 이벤트 이름, close code, payload/authorization contract 확인
- `docs/specs/06-gameplay-lifecycle.md` — join 시 초기 state relay와 reconnect 비지원 정책 확인
- `docs/specs/08-security-testing-and-delivery.md` — service-layer authorization 및 disconnect policy 경계 확인

**Implementation details:**
- `src/modules/realtime/gateway/realtime.gateway.ts`: `join-room` handler 추가. 토큰/roomId 입력 경계를 먼저 검사하고, 인증과 room access 검증은 전용 service port에 위임합니다.
- gateway는 인증 성공 후 socket을 room session map에 바인딩하고 `room-participants-updated` 이벤트로 최신 허용 상태를 반환합니다.
- `src/modules/realtime/service/realtime.interfaces.ts`: auth, room access, disconnect 위임용 interface와 `room-participants-updated` 초기 payload contract를 정의했습니다.
- `src/modules/realtime/service/realtime-defaults.service.ts`: 테스트/후속 통합 전까지 사용할 placeholder provider를 추가했습니다. 실제 구현은 Worker 1/2 또는 shared integration 단계에서 연결해야 합니다.
- `src/modules/realtime/service/realtime.constants.ts`: canonical realtime event name과 close code 상수를 모았습니다.
- `src/integrations/websocket/neco-ws.adapter.ts`: Nest `WsAdapter` 래퍼를 추가해 ws 기반 테스트와 후속 통합 지점을 고정했습니다.
- `src/modules/realtime/gateway/realtime.gateway.spec.ts`: invalid token, forbidden room, missing room, malformed payload, successful join의 WebSocket 시나리오 테스트를 추가했습니다.
- `src/modules/realtime/realtime.module.ts`: gateway와 port token provider를 구성했지만, `AppModule`에는 연결하지 않았습니다. 미완성 placeholder provider를 실제 앱에 노출하지 않기 위한 선택입니다.
- `package.json`, `pnpm-lock.yaml`: `@nestjs/websockets`, `@nestjs/platform-ws`, `ws`, `@types/ws`를 추가했습니다.

**Files changed:**
- `package.json`
- `pnpm-lock.yaml`
- `src/integrations/websocket/neco-ws.adapter.ts`
- `src/modules/realtime/realtime.module.ts`
- `src/modules/realtime/gateway/realtime.gateway.ts`
- `src/modules/realtime/gateway/realtime.gateway.spec.ts`
- `src/modules/realtime/service/realtime.constants.ts`
- `src/modules/realtime/service/realtime-defaults.service.ts`
- `src/modules/realtime/service/realtime.interfaces.ts`

**Verification:**
- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm lint`
- [x] `corepack pnpm build`
- [x] `corepack pnpm test -- realtime.gateway.spec.ts` — sandbox 포트 바인딩 제한으로 권한 상승 후 실행, 5개 테스트 통과
- [x] GPT-5.4 review subagent 재검토 완료 — 초기 지적사항(placeholder provider 앱 노출, undocumented `1011`, malformed payload gap) 반영 후 남은 코드 finding 없음 확인
- [ ] 실제 메인 앱 WebSocket bootstrap — 의도적으로 미연결 상태. 후속 auth/room/disconnect 실제 구현이 준비된 뒤 통합 필요
- [ ] disconnect 시 `LEFT` 전이/브로드캐스트 — W3-1에서는 delegation seam만 준비, authoritative disconnect policy는 실제 서비스 연결 후 검증 필요

**Commit:**
- `f80e591` feat(realtime): 인증 게이트웨이 기반 추가

**Impact on next tasks:**
- `W3-2`는 현재 gateway의 room session map, ws adapter, canonical event/close code 상수를 기반으로 `code-change`/`code-updated`를 추가할 수 있습니다.
- Worker 1/2 또는 shared integration 단계에서는 `REALTIME_AUTH_SERVICE`, `REALTIME_ROOM_ACCESS_SERVICE`, `REALTIME_DISCONNECT_SERVICE` 구현체를 제공해야 gateway를 메인 앱에 연결할 수 있습니다.
- malformed `join-room` payload는 현재 gateway boundary에서 즉시 닫히므로 downstream 서비스는 `gameRoomId`가 비어 있는 입력을 방어할 필요가 줄어듭니다.

**Design decisions made:**
- **foundation only, not globally wired**: placeholder provider를 메인 앱에 연결하면 사용자에게 `INTERNAL_ERROR` 경로만 노출하게 되므로, 모듈 구현과 앱 활성화를 분리했습니다.
- **ws adapter 선택**: close code 검증이 W3-1 acceptance에 포함되어 있어 Socket.IO보다 native `ws`가 더 직접적이라고 판단했습니다.
- **`userId` payload 비신뢰**: 보조 문서에 `userId`가 포함되어 있어도 gateway는 토큰 검증 결과만 service layer로 넘깁니다.
- **payload validation의 수동 경계 검사**: shared DTO 확장 없이 `join-room`에 필요한 최소 필드만 gateway에서 확인했습니다.

**Deviations from spec:**
- 없음. 외부로 노출되는 close code는 canonical set(`4401`, `4403`, `4404`, `1000`)만 사용합니다.
- reconnect 미지원 정책은 구현으로 확장하지 않았고, disconnect 처리 권한은 service layer seam으로만 남겼습니다. 이는 W3-1 acceptance의 foundation 범위 내 선택입니다.

**Trade-offs:**
- **메인 앱 즉시 연결 vs 모듈 분리 유지**: 즉시 연결하면 기능 노출은 되지만 실제 auth/room service가 없어 잘못된 실패 경로를 공개하게 됩니다. 따라서 통합 시점을 뒤로 미뤘습니다.
- **DTO/class-validator 도입 vs 수동 검사**: shared contract를 넓히지 않고 W3-1 범위만 해결하려고 수동 문자열 검사로 제한했습니다.

**Open questions:**
- [x] W3-1 단계에서 gateway를 메인 앱에 즉시 연결해야 하는가? → No. 실제 auth/room/disconnect 구현이 준비되기 전까지 foundation module로 유지.
- [ ] `REALTIME_DISCONNECT_SERVICE`의 authoritative 책임 범위를 Worker 2가 그대로 제공할지, shared integration(C4/C5)에서 turn timeout/room finish까지 포함해 묶을지 결정 필요

**Open risks or follow-ups:**
- 실제 app bootstrap 연결 시 `join-room` 초기 상태 payload를 room/participant 조회 DTO와 정밀하게 맞춰야 합니다.
- disconnect 정책(`LEFT`, `room-participants-updated`, current turn timeout, min participant finish`)은 현재 seam만 있고 실제 동작은 아직 없습니다.
- Jest WebSocket 시나리오 테스트는 로컬 포트 바인딩이 필요해 sandbox에서는 권한 상승이 필요했습니다.

**Instructions for the next worker:**
- `W3-2` 시작 전 이 로그와 `src/modules/realtime/gateway/realtime.gateway.ts`를 먼저 읽고, room session tracking 자료구조를 그대로 확장할 것
- 메인 앱에 `RealtimeModule`을 다시 연결하기 전에 반드시 세 port token 구현체를 실제 서비스로 교체할 것
- `join-room` 이후 초기 상태 이벤트 이름은 `room-participants-updated`로 고정되어 있으니 `code-updated`나 `game-state-updated`로 바꾸지 말 것
- close code contract는 `4401`, `4403`, `4404`, `1000`만 유지할 것

---

## [2026-05-21] W3-2: Implement code-sync transport and ephemeral session state

**Plan reference:** `docs/plans/worker-3-realtime-runtime-execution-plan.md`

**Summary:**
- `code-change` 입력과 `code-updated` fan-out을 gateway에 추가했습니다.
- 현재 턴 편집 권한 확인 port와 turn-scoped ephemeral code buffer를 분리해 realtime content가 durable persistence로 새지 않도록 막았습니다.
- `join-room`이 이미 진행 중인 방에 붙는 경우 `gameState.turnState`에서 current-turn support state를 seed 하도록 보강했습니다.

**Dependencies reviewed before starting:**
- `docs/plans/README.md` — 병렬 worker read order와 shared-contract 변경 금지 규칙 재확인
- `docs/plans/common-sequential-plan.md` — C1/C2 완료 상태 및 worker 병렬 진행 가능 여부 재확인
- `docs/plans/worker-3-realtime-runtime-execution-plan.md` — W3-2 acceptance criteria, verification 범위 확인
- `docs/implementaion-logs/README.md` — task 단위 커밋/로그 분리 규칙 확인
- `docs/implementaion-logs/common/phase-1-foundation.md` — shared enum/config/persistence baseline 확인
- `docs/implementaion-logs/worker-3/phase-1-realtime.md` — W3-1 산출물과 unresolved disconnect 범위 질문이 W3-2 비차단성임을 확인
- `docs/specs/05-api-and-realtime.md` — canonical event 이름과 whole-file `content` contract 확인
- `docs/specs/06-gameplay-lifecycle.md` — current turn player edit rule, ephemeral realtime buffer, snapshot persistence 시점 확인
- `docs/specs/07-integrations-and-ai.md` — Redis가 support-state 경계에만 머물러야 한다는 원칙 확인
- `docs/specs/08-security-testing-and-delivery.md` — realtime content 비영속화와 reconnect 비지원 제약 확인

**Implementation details:**
- `src/modules/realtime/gateway/realtime.gateway.ts`: `code-change` handler를 추가했습니다. join된 socket/session만 허용하고, current turn edit 여부는 `REALTIME_TURN_EDIT_SERVICE` port에 위임합니다.
- 동일 파일에서 `code-updated`는 룸 내 다른 socket에만 fan-out 하며, `occurredAt`는 클라이언트 값이 아니라 서버가 생성한 KST ISO timestamp를 사용합니다.
- gateway는 `join-room` 성공 시 `initialState.gameState.turnState`가 있으면 current-turn support state를 cache에 seed 합니다.
- `src/modules/realtime/service/realtime.interfaces.ts`: `CodeChangePayload`, `CodeUpdatedEvent`, `RealtimeTurnEditService`, `RealtimeSupportStateStore`를 추가했습니다. latest file content buffer는 `turnId` 단위로 scope를 나눴습니다.
- `src/integrations/redis/realtime-support-state.store.ts`: Redis adapter 경계 뒤의 in-memory fallback store를 구현했습니다. room/turn/filePath 3단계 Map으로 latest content를 분리하고 current turn state getter/clear seam을 열었습니다.
- `src/integrations/redis/redis.module.ts`: support-state store token을 export 하도록 보강했습니다. Worker 3 단계에서는 Redis usage를 optional fallback 범위로 제한했습니다.
- `src/modules/realtime/gateway/realtime.gateway.spec.ts`: code fan-out, unauthorized edit ignore, join-time current-turn cache seed, support-state failure swallow 시나리오를 추가했습니다.

**Files changed:**
- `src/integrations/redis/redis.module.ts`
- `src/integrations/redis/realtime-support-state.store.ts`
- `src/modules/realtime/gateway/realtime.gateway.ts`
- `src/modules/realtime/gateway/realtime.gateway.spec.ts`
- `src/modules/realtime/realtime.module.ts`
- `src/modules/realtime/service/realtime-defaults.service.ts`
- `src/modules/realtime/service/realtime.constants.ts`
- `src/modules/realtime/service/realtime.interfaces.ts`

**Verification:**
- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm lint`
- [x] `corepack pnpm build`
- [x] `corepack pnpm test -- realtime.gateway.spec.ts` — 권한 상승 후 실행, 8개 테스트 통과 (`code-change` fan-out/unauthorized rejection 포함)
- [x] GPT-5.4 review subagent 1차 finding 반영 완료 — stale turn scope, client timestamp echo, code-change 예외 누락 지적을 수정함
- [ ] `corepack pnpm test -- realtime.gateway.spec.ts` 최종 재실행 — join-time current-turn cache seed 테스트 추가 직후 포트 바인딩 권한 재승인 한도에 걸려 미실행
- [ ] GPT-5.4 follow-up re-review — 사용 한도 초과로 추가 subagent 실행 불가

**Commit:**
- `5b1ecf5` feat(realtime): 코드 동기화 상태 캐시 추가

**Impact on next tasks:**
- `W3-3`와 shared `C4`는 room/turn snapshot persistence를 붙일 때 `RealtimeSupportStateStore.getLatestFileContent({ gameRoomId, turnId, filePath })`를 사용해 current-turn code snapshot을 읽을 수 있습니다.
- 실제 authoritative turn progression이 연결되면 turn 전이 시점에 `clearLatestFileContents({ gameRoomId, turnId })`를 호출해 이전 turn buffer를 정리해야 합니다.
- Worker 2/shared integration에서는 `REALTIME_TURN_EDIT_SERVICE` 실제 구현체가 `currentTurnId`, `currentTurnUserId`, `isEditable`을 함께 제공해야 합니다.

**Design decisions made:**
- **turn-scoped buffer**: room 단위만으로는 이전 turn content가 다음 turn timeout path에 섞일 수 있어 `turnId`를 포함한 ephemeral buffer로 제한했습니다.
- **server timestamp only**: `occurredAt`는 외부 계약에 노출되는 값이므로 클라이언트 payload를 신뢰하지 않고 서버에서 생성합니다.
- **failure swallow on code sync**: code-sync는 support path라서 auth/cache 장애가 authoritative state corruption이나 process error로 번지지 않도록 log 후 return 하게 했습니다.
- **optional Redis fallback**: 계획 문서의 “in-memory or Redis-backed” 범위에 맞춰 W3-2에서는 in-memory fallback만 구현하고, multi-instance fan-out은 후속 Redis adapter로 남겼습니다.

**Deviations from spec:**
- 없음. 외부 WebSocket contract는 `code-change`/`code-updated` canonical event name과 whole-file `content` payload를 유지합니다.
- Redis는 support-state 책임 영역으로만 유지했고, realtime content는 여전히 durable persistence에 저장하지 않았습니다.

**Trade-offs:**
- **실제 Redis client 도입 vs fallback store 유지**: W3-2 acceptance가 optional Redis를 허용하므로 외부 인프라 의존성 없이 gateway 계약과 test coverage를 먼저 고정했습니다.
- **unauthorized code-change close vs ignore**: 스펙이 “무시한다”를 요구하므로 close code를 추가하지 않고 no-op 처리했습니다.

**Open questions:**
- [ ] turn 전이 직후 `RealtimeSupportStateStore` 정리 책임을 Worker 3의 후속 runtime path(`W3-3`/`W3-4`)에서 먼저 붙일지, shared integration(`C4`)에서 authoritative turn create와 함께 묶을지 결정 필요
- [ ] Redis-backed multi-instance fan-out fallback을 W3 stream에서 선행할지, MVP 범위상 shared stabilization(`C5`)로 미룰지 결정 필요

**Open risks or follow-ups:**
- 현재 store는 process-local fallback이므로 멀티 인스턴스/재시작 내구성은 없습니다. 단일 인스턴스 MVP 범위에서만 안전합니다.
- join-time current-turn cache seed는 `initialState.gameState.turnState`가 포함되는 경우에만 동작합니다. room access service 실제 구현이 이 shape를 보존해야 합니다.
- 최종 join-seed test 추가 후 WebSocket 재실행은 환경 승인 한도로 인해 다시 확인하지 못했습니다.

**Instructions for the next worker:**
- `W3-3` 시작 전 `src/modules/realtime/service/realtime.interfaces.ts`의 `RealtimeSupportStateStore` 시그니처를 먼저 읽고, snapshot persistence가 `turnId` scoped buffer를 소비하도록 맞출 것
- `REALTIME_TURN_EDIT_SERVICE` 구현체는 `isEditable`뿐 아니라 `currentTurnId`와 `currentTurnUserId`도 반드시 반환할 것
- `code-updated` payload에 `turnId`를 외부로 노출하지 말 것. `turnId`는 support-state 내부 scope 용도만 유지할 것
- turn 전이/mission 종료 시 이전 turn buffer clear를 빠뜨리지 말 것
