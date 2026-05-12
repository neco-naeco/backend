# neco-naeco 기술 명세서 (Tech Spec)

> 버전: 1.0 | 작성일: 2026-05-11

---

## 1. 문서 개요

### 1.1 목적

이 문서는 `neco-naeco` 백엔드의 구현 기준 문서다. 단순한 아키텍처 소개가 아니라, 구현자가 그대로 서버 구조, 실시간 이벤트, AI 연동, Docker 실행 파이프라인을 설계하고 코드를 작성할 수 있도록 작성한다.

특히 다음 항목을 명확하게 고정하는 것을 목표로 한다.

- 각 모듈의 책임 경계
- 상태 전이 규칙과 변경 주체
- API / WebSocket 계약
- AI와 서버가 각각 결정하는 범위
- 트랜잭션 경계와 실패 처리 기준

### 1.2 범위

- NestJS 단일 백엔드 서버 기준의 MVP 설계
- PostgreSQL 기반 영속 데이터 설계
- WebSocket 기반 실시간 게임 진행 동기화
- Docker 또는 외부 Container Runtime 기반 미션 실행 구조
- LLM 기반 AI 채팅, 피드백, 판정 보조 구조

### 1.3 참조 문서

- [`project-plan.md`](./project-plan.md): 서비스 목적, MVP 범위, 핵심 기능
- [`api-convention.md`](./api-convention.md): API 공통 규칙
- [`api-spec.md`](./api-spec.md): HTTP / WebSocket 계약
- [`erd.md`](./erd.md): 데이터 모델과 관계
- [`folder-structure.md`](./folder-structure.md): 서버 디렉토리와 계층 책임
- [`sequence-diagram.md`](./sequence-diagram.md): 주요 플로우 시퀀스
- [`user-flow.md`](./user-flow.md): 사용자 여정

### 1.4 구현 기준 문서 우선순위

문서 간 충돌이 발생할 경우 우선순위는 다음과 같이 둔다.

1. `api-spec.md`: 외부 계약과 이벤트명 기준
2. `erd.md`: 저장 모델 기준
3. `folder-structure.md`: 서버 책임 분리 기준
4. `plan.md`, `sequence-diagram.md`, `user-flow.md`: 의도와 사용자 흐름 보조 기준

충돌 지점은 본 문서의 `16. 결정 사항 및 오픈 이슈`에 명시한다.

### 1.5 현재 저장소 상태

- 현재 저장소에는 구현 코드(`src/`)가 아직 없고, `docs/etc` 하위 설계 문서가 구현 기준의 중심이다.
- 현재 확인 가능한 저장소 파일은 `README.md`와 `docs/etc/*.md` 수준이며, 본 문서는 코드가 없는 상태에서 구현 착수를 위한 기준 문서 역할을 한다.
- 따라서 본 문서의 Repository Facts는 "현재 코드 구현"이 아니라 "현재 저장소에 존재하는 설계 문서와 합의된 구조"를 기준으로 작성한다.

---

## 2. MVP 범위

### 2.1 구현 대상

- 회원가입 / 로그인 / 토큰 재발급
- AI 채팅 기반 게임방 생성, 참가자 초대, 초대 수락/거절, 게임 시작 준비
- 게임방, 참가자, 미션, 턴, 스냅샷, 실행 결과, 판정 결과 저장
- WebSocket 기반 실시간 참가자 / 코드 / 턴 / 결과 동기화
- Docker 기반 미션 실행 환경 준비 및 코드 실행 요청
- AI 게임 마스터의 채팅 의도 해석, 미션 피드백, 힌트/실시간 알림 생성

### 2.2 MVP 제외 대상

- 랭킹 / 프로필 / 친구 목록 / 게임 다시 시작
- 결제, 상점, 업적 시스템
- 컨테이너 내부 GUI 데스크톱 환경
- 대규모 트래픽 분산 처리, 멀티 리전, 고가용성 운영 자동화
- 멀티 LLM provider 자동 전환
- 복잡한 운영 콘솔과 관리자 전용 백오피스

### 2.3 핵심 MVP 제약

- 모든 리소스 접근은 인증된 사용자 기준으로 제한한다.
- 게임 진행의 authoritative state는 서버가 가진다.
- AI는 상태 전이의 제안과 설명을 담당하지만, 게임의 최종 상태 변경 권한은 서버에 있다.
- 코드 동기화는 실시간 협업용이며, 턴 종료 시점의 스냅샷만 영속 저장의 기준으로 본다.
- 미션 실행은 애플리케이션 프로세스 내부가 아니라 격리된 런타임(Docker/외부 Runtime)에서 수행한다.

---

## 3. 도메인 모델 및 핵심 개념

### 3.1 User

시스템 사용자다. 로그인 식별자, 닉네임, 비밀번호 해시, 이메일을 가진다. 게임방 생성, 참가, 턴 수행, AI 채팅 세션 시작의 주체다.

연관:

- `refresh_tokens` (1:N)
- `game_rooms.owner_user_id`
- `game_room_participants.user_id`
- `turns.player_user_id`
- `executions.user_id`
- `ai_chat_sessions.requester_user_id`

### 3.2 RefreshToken

로그인 세션 유지용 토큰 저장 단위다. 서버는 refresh token 원문 대신 해시를 저장한다. 재발급 시 유효성, 만료, 폐기 여부를 검증한다.

### 3.3 GameRoom

게임의 상위 컨테이너다. 방장, 난이도, 제한 시간, 최대 스트라이크, 참가 인원 범위를 가진다. 게임이 아직 준비 단계인지, 진행 중인지, 판정 중인지, 종료되었는지를 표현한다.

상태값:

- `WAITING`
- `IN_PROGRESS`
- `JUDGING`
- `ANALYZED`
- `FINISHED`

권장 전이:

`WAITING -> IN_PROGRESS -> JUDGING/ANALYZED -> FINISHED`

실제 구현에서는 `JUDGING`와 `ANALYZED`를 최종 미션 판정 중간 상태로 사용한다.

### 3.4 GameRoomParticipant

사용자의 방 소속 상태를 나타낸다. 방장 여부와 참가 상태를 함께 가진다. 초대 기반 입장 흐름의 핵심 엔티티다.

역할:

- `OWNER`
- `PARTICIPANT`

참가 상태:

- `INVITED`
- `JOINED`
- `LEFT`
- `DENIED`

상태 변경 주체:

- 방장 초대 시 `INVITED` 생성
- 초대 대상 수락 시 `JOINED`
- 초대 대상 거절 시 `DENIED`
- 자발적 이탈 또는 게임 종료 후 정리 시 `LEFT`

### 3.5 MissionTemplate

게임 시작 전에 선택되는 미션 원본이다. 제목, 설명, 언어, 난이도, 기본 제한 시간, 기본 스트라이크, 판정 정책, 프로젝트 초기 구조를 포함한다.

핵심 필드:

- `judge_policy_json`
- `project_structure_json`
- `docker_image_id`

### 3.6 MissionTemplateStep

미션을 단계적으로 수행하기 위한 세부 단계 정의다. 각 단계는 목표 파일, 단계 설명, 단계별 성공 기준, 단계별 힌트를 가진다.

### 3.7 GameRoomMission

특정 게임방에서 실제로 진행 중인 미션 인스턴스다. 선택된 미션 템플릿을 기준으로 생성되며, 현재 단계, 컨테이너 식별자, 누적 스트라이크, 시작/종료 시각을 가진다.

변경 주체:

- 게임 시작 시 서버 생성
- 턴 판정 결과에 따라 `current_step_id`, `strike_count`, `finished_at` 갱신

### 3.8 GameRoomMissionStep

실제 게임방에서의 단계 진행 상태다. 템플릿 단계 정의를 복사한 실행 상태로 본다.

상태값:

- `LOCKED`
- `READY`
- `IN_PROGRESS`
- `CLEARED`
- `FAILED`

일반 전이:

- 첫 단계: `READY -> IN_PROGRESS -> CLEARED/FAILED`
- 이후 단계: `LOCKED -> READY -> IN_PROGRESS -> CLEARED/FAILED`

### 3.9 Turn

한 플레이어가 편집 권한을 가진 시간 조각이다. 현재 플레이어, 턴 번호, 시작/마감 시각, 종료 상태를 가진다.

`api-spec.md` 기준 상태값:

- `IN_PROGRESS`
- `SUBMITTED`
- `EXPIRED`
- `COMPLETED`

`erd.md`에는 `TIMEOUT`이 있으므로, 외부 계약은 `api-spec.md`의 `EXPIRED`를 우선 채택하고 내부 저장 모델 정리는 오픈 이슈로 둔다.

### 3.10 TurnSnapshot

턴 종료 시점의 저장 기준 코드 스냅샷이다. 실시간 편집 내용 전체를 저장하지 않고, 제출 또는 시간 만료 시점의 파일 집합만 저장한다.

### 3.11 Execution

컨테이너 실행 요청과 실행 결과를 함께 저장하는 단위다. 명령어, 실행 상태, stdout, stderr, exitCode, 세션 정보를 가진다.

상태값:

- `PENDING`
- `RUNNING`
- `SUCCESS`
- `FAILED`
- `TIMEOUT`

### 3.12 MissionResult

턴 제출 또는 최종 종료 시점의 판정 결과다. 판정 성공 여부, 입출력 비교, 탐지된 문제, 제안 명령, 피드백 메시지 등을 저장한다.

판정 상태:

- `PASSED`
- `FAILED`
- `ERROR`

### 3.13 AiChatSession / AiChatRequest / AiChatMessage

메인 화면의 AI 게임 마스터 대화를 담당하는 도메인이다.

- `AiChatSession`: 사용자와 AI 사이의 대화 세션
- `AiChatRequest`: 특정 사용자 메시지로부터 파생된 명령 해석 요청
- `AiChatMessage`: USER / ASSISTANT / SYSTEM 메시지 로그

이 도메인은 방 생성, 초대, 참가, 거절, 시작 준비 같은 채팅 기반 명령을 담당한다.

### 3.14 AiGameSession / AiGameRequest / AiRealtimeEvent

게임 진행 중 AI 보조 기능을 담당하는 도메인이다.

- `AiGameSession`: 특정 게임방과 연결된 AI 세션
- `AiGameRequest`: 디버깅, 판정, 피드백 요청 단위
- `AiRealtimeEvent`: 힌트 팝업, 미션 피드백, 디버그 요약 등 실시간 전달 이벤트

이 도메인은 게임 진행 중의 AI 보조 정보 제공을 담당하며, authoritative state 저장은 하지 않는다.

### 3.15 DockerImage / DockerImageDeployment

미션 실행 환경의 버전 관리 단위다.

- `DockerImage`: 실행 이미지 메타데이터
- `DockerImageDeployment`: 특정 미션 또는 운영 변경에 대한 이미지 반영 이력

MVP 기준으로는 미션 템플릿이 어떤 런타임 이미지를 사용하는지 식별하고, 실행 환경 준비 시 이를 참조하는 수준까지를 다룬다.

---

## 4. 시스템 아키텍처

### 4.1 전체 구조

시스템은 NestJS 단일 서버를 기준으로 설계한다.

```text
Client
 ├─ HTTP API
 └─ WebSocket
        │
        ▼
NestJS Server
 ├─ Auth / AI Chat / GameRoom / Mission / Turn / Result Modules
 ├─ Realtime Gateway
 ├─ PostgreSQL
 ├─ Redis / MQ (필요 시)
 ├─ LLM Integration
 └─ Docker / Container Runtime Integration
```

### 4.2 동기 처리와 비동기 처리 경계

동기 처리:

- 인증
- 메인 진입용 조회 API
- AI 채팅 메시지 수신과 즉시 응답
- 게임 시작 요청
- 힌트 조회

비동기 또는 비동기 성격 처리:

- 코드 실행 요청과 결과 수집
- AI 판정 보조 / 피드백 생성
- WebSocket 브로드캐스트
- 실시간 세션 복구

### 4.3 인프라 역할

**PostgreSQL**

- 사용자, 방, 참가자, 미션, 턴, 실행 결과, AI 세션 영속 저장

**Redis**

- WebSocket 세션 보조 상태
- 현재 게임 상태 캐시
- 브로드캐스트 fan-out 보조
- 필요한 경우 분산 락 또는 타이머 상태 보조

**MQ**

- 실행 요청 / AI 판정 작업을 별도 consumer로 분리해야 할 경우를 위한 확장 포인트
- MVP에서는 필수는 아니지만 `integrations/mq` 계층을 열어 둔다

**LLM**

- AI 채팅 intent 해석
- 미션 피드백, 디버깅 요약, 판정 보조 설명 생성

**Docker / Container Runtime**

- 미션 시작 시 실행 환경 준비
- 제출 코드 실행
- 실행 stdout/stderr/exit code 반환

### 4.4 아키텍처 제약

- NestJS 단일 애플리케이션을 기준으로 하되, HTTP API와 WebSocket Gateway를 같은 서버 경계 안에서 운영한다.
- authoritative state는 서버 서비스 계층에서만 변경한다.
- 실시간 코드 편집 상태는 비영속 상태로 취급하고, 턴 종료 시점 snapshot만 영속 저장한다.
- Docker/LLM/Redis 같은 외부 시스템은 `integrations/` 계층 뒤로 숨기고, 도메인 서비스가 외부 SDK를 직접 호출하지 않는다.
- MVP 단계에서는 멀티 인스턴스 운영보다 단일 서버에서의 정확한 상태 전이와 복구 가능성을 우선한다.

---

## 5. 폴더 구조

`folder-structure.md`를 기준으로 다음 경계를 유지한다.

- `common/`: 프레임워크 레벨 공통 기능
- `database/`: DB 연결, migration, seed
- `integrations/`: jwt, redis, mq, websocket, llm, runtime 연동
- `shared/`: 도메인 간 공통 DTO, enum, interface, mapper
- `modules/`: 기능별 독립 도메인 단위

핵심 규칙:

- `Controller -> Service -> Repository -> Entity`
- `Service -> Integrations`
- `Controller`와 `Gateway`는 orchestration만 수행
- Entity는 외부 API 응답 모델로 직접 노출하지 않음

---

## 6. 모듈 설계

### 6.1 auth

책임:

- 회원가입
- 로그인
- access token 발급
- refresh token 재발급

주요 유스케이스:

- `GET /v1/auth/check-nickname`
- `POST /v1/auth/signup`
- `POST /v1/auth/login`
- `POST /v1/auth/refresh-token`

연관 엔티티:

- `users`
- `refresh_tokens`

인가 규칙:

- signup, login, refresh는 인증 예외

### 6.2 ai-chat-sessions

책임:

- 메인 화면 AI 채팅 세션 조회
- 채팅 메시지 조회
- 사용자 메시지 수신
- ROOM_CREATE / USER_INVITE / ROOM_JOIN / USER_INVITE_DENY / GAME_START 의도 해석

연관 엔티티:

- `ai_chat_sessions`
- `ai_chat_requests`
- `ai_chat_messages`

외부 연동:

- `integrations/llm`
- 필요 시 `game-rooms`, `game-room-participants` 서비스 호출

인가 규칙:

- 세션 조회는 본인 세션만 허용
- 연결된 `game_room_id`가 있다면 해당 방 접근 권한 검증

### 6.3 game-rooms

책임:

- 사용자가 접근 가능한 방 목록 조회
- 방 생성
- 방 상태 조회
- 게임 시작

연관 엔티티:

- `game_rooms`
- `game_room_missions`

외부 연동:

- `integrations/llm` 결과를 받아 생성 보조
- `docker-images` / runtime integration으로 환경 준비 요청

인가 규칙:

- 목록은 본인 소속 방만 반환
- 시작은 방장만 가능

### 6.4 game-room-participants

책임:

- 참가자 목록 조회
- 초대 생성
- 초대 수락
- 초대 거절
- 이탈 처리

연관 엔티티:

- `game_room_participants`

인가 규칙:

- 초대 생성은 방장만 가능
- 수락/거절은 본인 초대 건만 가능

### 6.5 game-room-missions

책임:

- 방 시작 시 미션 인스턴스 생성
- 현재 단계 추적
- 힌트 조회
- 최종 종료 처리

연관 엔티티:

- `game_room_missions`
- `game_room_mission_steps`
- `mission_templates`
- `mission_template_steps`

외부 연동:

- runtime integration
- AI game session 생성

### 6.6 turns

책임:

- 현재 턴 생성
- 턴 종료
- 다음 턴 생성
- 제출 / 만료 / 완료 상태 관리
- 턴 스냅샷 저장

연관 엔티티:

- `turns`
- `turn_snapshots`

인가 규칙:

- 제출은 현재 턴 플레이어만 가능
- 조회는 해당 방 참가자만 가능

### 6.7 executions

책임:

- 코드 실행 요청 저장
- 실행 상태 추적
- stdout/stderr/exitCode 저장

연관 엔티티:

- `executions`

외부 연동:

- `integrations/runtime`

### 6.8 mission-results

책임:

- 턴 판정 결과 저장
- 최종 미션 결과 저장
- 스트라이크 반영과 단계 성공/실패 결과 반영

연관 엔티티:

- `mission_results`
- `game_room_missions`
- `game_room_mission_steps`

외부 연동:

- `integrations/llm`
- `executions`

### 6.9 realtime gateway

책임:

- WebSocket 연결 수립
- `join-room` 인증과 룸 바인딩
- 코드 변경 / 턴 제출 / 상태 브로드캐스트
- 재접속 시 최신 상태 전달

연관 엔티티:

- 세션 캐시
- `game_rooms`, `turns`, `game_room_missions`

핵심 규칙:

- Gateway는 상태를 직접 결정하지 않는다.
- 모든 authoritative state 변경은 Service를 통해 수행한다.

### 6.10 docker-images / runtime integration

책임:

- 미션 템플릿과 실행 이미지 매핑
- 컨테이너 준비
- 실행 명령 전달
- 실행 결과 수집

연관 엔티티:

- `docker_images`
- `docker_image_deployments`

### 6.11 prompt-template / ai-template 관리

책임:

- AI 채팅 intent 해석용 템플릿
- 미션 피드백 / 디버깅 / 판정 보조용 프롬프트 템플릿 관리

MVP에서는 일반 사용자 공개 API 없이 내부 데이터 또는 seed 수준 관리로 둔다.

---

## 7. 데이터 설계

### 7.1 핵심 관계 요약

```text
users
 └─ refresh_tokens

game_rooms
 └─ game_room_participants
 └─ game_room_missions
     └─ game_room_mission_steps
     └─ turns
         └─ turn_snapshots
         └─ executions
         └─ mission_results

mission_templates
 └─ mission_template_steps

ai_chat_sessions
 └─ ai_chat_requests
 └─ ai_chat_messages

ai_game_sessions
 └─ ai_game_requests
 └─ ai_realtime_events
```

### 7.2 저장 원칙

- 외부 API 응답용 필드는 `camelCase`
- DB 컬럼은 `snake_case`
- JSON 구조가 자주 바뀌는 영역은 `jsonb` 사용
- 코드 원문, 프로젝트 구조, 판정 payload는 `jsonb` 또는 text로 저장

### 7.3 인덱스 권장 컬럼

- `game_rooms(owner_user_id, status)`
- `game_room_participants(game_room_id, user_id)`
- `game_room_participants(user_id, membership_status)`
- `game_room_missions(game_room_id)`
- `turns(game_room_id, mission_id)`
- `executions(game_room_id, mission_id, turn_id)`
- `mission_results(game_room_id, mission_id, turn_id)`
- `ai_chat_sessions(requester_user_id)`
- `ai_chat_messages(ai_chat_session_id, created_at)`
- `ai_game_requests(ai_game_session_id, requested_at)`

### 7.4 상태값 관리 원칙

- 상태값은 DB에서는 `text`로 저장하고 애플리케이션 레벨 enum으로 검증한다.
- 공통 enum은 `shared/enums` 또는 `common/constants`로 중앙 관리한다.
- 상태값이 문서마다 다르면 `api-spec.md`를 우선 채택하고 저장 모델은 추후 정리한다.

### 7.5 영속 저장과 비영속 상태 분리

- 실시간 코드 변경 델타: 비영속 또는 캐시성 상태
- 턴 종료 스냅샷: 영속 저장
- 컨테이너 실행 로그 전문: 필요 시 길이 제한 또는 별도 저장소 확장 가능
- AI 메시지 로그: 재현성과 디버깅을 위해 저장

---

## 8. API 설계

### 8.1 기본 규칙

- Base URL은 `/v1`
- 리소스명은 복수형
- URL은 `kebab-case`
- 요청/응답 JSON 필드는 `camelCase`
- 응답 래퍼는 항상 `data`, `meta`, `error`

### 8.2 공통 응답 형식

성공:

```json
{
  "data": {},
  "meta": {
    "requestId": "uuid"
  },
  "error": null
}
```

실패:

```json
{
  "data": null,
  "meta": {
    "requestId": "uuid"
  },
  "error": {
    "code": "ERROR_CODE",
    "message": "message"
  }
}
```

### 8.3 인증 예외

- `GET /v1/auth/check-nickname`
- `POST /v1/auth/signup`
- `POST /v1/auth/login`
- `POST /v1/auth/refresh-token`

### 8.4 주요 엔드포인트 카테고리

**Auth**

- 닉네임 중복 확인
- 회원가입
- 로그인
- 토큰 재발급

**Main Entry**

- `GET /v1/ai-chat-sessions`
- `GET /v1/game-rooms`
- `GET /v1/game-room-participants`

**AI Chat**

- `GET /v1/ai-chat-sessions/{aiChatSessionId}/messages`
- `POST /v1/ai-chat-sessions/{aiChatSessionId}/messages`

**Game Start**

- `POST /v1/game-rooms/{gameRoomId}/start`

**Hint**

- `GET /v1/game-room-missions/{missionId}/hints?scope=current-step`

### 8.5 API 설계 원칙 요약

- 방 생성과 초대 같은 행위는 action endpoint를 허용하되, 최종 상태 변경 대상 리소스를 분명히 한다.
- 단일 조회 결과가 없으면 `404`, 리스트가 비어 있으면 `[]`
- DB의 snake_case를 응답에 직접 노출하지 않는다.
- 프론트는 게임 시작 이후 전체 상태를 HTTP가 아니라 WebSocket 이벤트 중심으로 반영한다.

---

## 9. 게임 진행 및 턴 파이프라인

### 9.1 메인 진입

로그인 후 클라이언트는 다음 데이터를 조합해 진입 상태를 구성한다.

- `GET /game-rooms`
- `GET /game-room-participants`
- `GET /ai-chat-sessions`

판단 기준:

- `WAITING` 방이 있으면 대기방 진입 후보
- `IN_PROGRESS` 방이 있으면 게임 화면 재진입 후보
- 초대 상태가 있으면 초대 브리핑 노출
- 아무 방도 없으면 AI 채팅 기반 생성 유도

### 9.2 방 생성 파이프라인

1. 사용자가 AI 채팅 메시지를 보낸다.
2. AI 채팅 서비스가 intent를 `ROOM_CREATE`로 해석한다.
3. 난이도와 미션 템플릿 후보를 제안한다.
4. 사용자가 선택을 확정하면 서버가 `game_room`을 생성한다.
5. 동시에 방장 participant를 `OWNER + JOINED`로 생성한다.
6. 선택된 템플릿의 실행 환경 준비를 예약하거나 즉시 수행한다.
7. 방 생성 결과를 채팅 메시지와 대기방 상태로 반영한다.

### 9.3 초대 / 수락 / 거절 파이프라인

**초대**

1. 방장이 AI 채팅으로 유저 초대를 요청한다.
2. 서버가 초대 대상 존재 여부와 중복 소속을 검증한다.
3. `game_room_participants`를 `INVITED` 상태로 생성한다.
4. `room-participants-updated`를 브로드캐스트한다.

**수락**

1. 참여자가 초대를 수락한다.
2. 서버가 해당 초대가 본인 것인지 확인한다.
3. participant 상태를 `JOINED`로 변경한다.
4. 참가자 목록과 방 상태를 브로드캐스트한다.

**거절**

1. 참여자가 초대를 거절한다.
2. participant 상태를 `DENIED`로 변경한다.
3. 방장과 참가자들에게 상태 변경을 브로드캐스트한다.

### 9.4 게임 시작 파이프라인

게임 시작 시 서버가 authoritative하게 다음을 수행한다.

1. 요청 사용자가 방장인지 검증
2. 최소 참가 인원 충족 여부 검증
3. 방 상태가 `WAITING`인지 검증
4. 선택된 `mission_template` 확정
5. `game_room_mission` 생성
6. `game_room_mission_steps` 생성
7. 첫 단계 `READY` 설정
8. 첫 턴 생성
9. 방 상태를 `IN_PROGRESS`로 변경
10. `game-started`, `game-state-updated` 브로드캐스트

### 9.5 코드 동기화 파이프라인

실시간 코드 변경은 WebSocket 기반으로만 전파한다.

1. 현재 턴 사용자만 편집 가능
2. `code-change` 이벤트로 변경 델타 전송
3. 서버는 룸의 다른 참가자에게 `code-updated` 브로드캐스트
4. 이 데이터는 협업용이며 곧바로 DB에 저장하지 않는다.

저장 기준:

- 턴 제출 시점
- 시간 초과로 서버가 턴 종료 처리하는 시점

### 9.6 턴 제출과 판정 파이프라인

1. 현재 턴 사용자가 `turn-submit` 이벤트 전송
2. 서버가 현재 턴 사용자 여부와 턴 상태를 검증
3. 최신 코드 스냅샷 저장
4. 턴 상태를 `SUBMITTED`로 변경
5. 실행 요청 생성
6. 컨테이너 런타임에 코드 실행 요청
7. 실행 결과 수집
8. 서버 규칙 기반 1차 판정 수행
9. 필요 시 AI 보조 피드백 생성
10. `turn-evaluated` 브로드캐스트

판정 결과에 따라:

- 단계 성공: 현재 단계 `CLEARED`, 다음 단계 `READY` 또는 미션 종료
- 단계 실패: 스트라이크 증가, 단계 유지 또는 `FAILED`

### 9.7 타임아웃 처리

서버는 턴의 `deadlineAt`을 기준으로 타임아웃을 감지한다.

처리 규칙:

- 편집 가능 시간 종료 시 자동 제출과 동일한 흐름으로 스냅샷 저장 가능
- 또는 스냅샷 없이 `EXPIRED` 상태 전환 가능
- MVP에서는 마지막 수신 코드 상태를 스냅샷으로 저장하고 판정 흐름에 포함하는 방식을 권장한다

상세 정책은 구현 시 고정해야 하며, 현재 문서에서는 서버가 authoritative하게 턴 종료를 결정한다는 점을 우선 확정한다.

### 9.8 다음 턴 전이

`turn-evaluated` 이후 서버는 다음 상태를 결정한다.

- 다음 플레이어 순서 계산
- 새 턴 생성
- 이전 턴 상태 종료
- `turn-changed` 브로드캐스트

실패하더라도 스트라이크 한도 내에서는 다음 턴으로 진행한다.

### 9.9 최종 종료 파이프라인

다음 조건 중 하나를 만족하면 게임 종료를 검토한다.

- 마지막 단계 클리어
- 스트라이크 한도 초과
- 운영 정책상 강제 종료

종료 시 서버는:

1. 최종 `mission_result` 저장
2. `game_rooms.status = FINISHED`
3. 필요 시 `game_room_missions.finished_at` 기록
4. `mission-result`와 `game-state-updated` 브로드캐스트

### 9.10 WebSocket 이벤트 계약

`api-spec.md` 기준 이벤트명을 그대로 사용한다.

- `join-room`
- `room-participants-updated`
- `game-started`
- `code-change`
- `code-updated`
- `turn-submit`
- `turn-evaluated`
- `turn-changed`
- `game-state-updated`
- `mission-result`

이벤트 payload의 필드 구조는 `api-spec.md`를 외부 계약 기준으로 유지한다.

---

## 10. 외부 연동 설계 (Docker, LLM, Socket)

### 10.1 Docker / Container Runtime

책임:

- 미션별 실행 환경 준비
- 컨테이너 식별자 발급 및 매핑
- 코드 실행 요청
- stdout, stderr, exitCode 반환

권장 흐름:

1. 게임 시작 시 미션 템플릿이 참조하는 이미지 확인
2. 런타임 컨테이너 준비
3. `game_room_missions.container_id` 저장
4. 턴 제출 시 실행 명령 전달
5. 실행 결과를 `executions`에 저장

실패 시:

- 실행 실패는 게임 실패와 동일하지 않다
- 런타임 오류는 `mission_results.judge_status = ERROR` 또는 AI 피드백 경유 실패로 처리 가능

### 10.2 LLM 연동

LLM은 세 가지 역할을 가진다.

1. AI 채팅 intent 해석
2. 디버깅 / 미션 피드백 생성
3. 실시간 보조 알림 생성

핵심 원칙:

- LLM은 authoritative state를 직접 수정하지 않는다.
- LLM 결과는 항상 서버 검증 뒤 반영한다.
- intent 해석 결과는 내부 command DTO로 변환해 사용한다.

### 10.3 Socket / Redis / MQ

**WebSocket**

- 실시간 세션 연결
- 룸 단위 브로드캐스트
- 코드 변경 전파

**Redis**

- 세션 연결 상태
- 현재 턴 보조 상태 캐시
- 다중 인스턴스 브로드캐스트 보조

**MQ**

- 코드 실행 / AI 판정이 무거워질 경우 비동기 작업 큐로 확장
- MVP에서는 동기+비동기 혼합 구조를 허용하되 `integrations/mq` 경로는 미리 열어 둔다

---

## 11. AI 게임 마스터 정책

### 11.1 AI가 결정하는 것

- 사용자의 자연어 메시지 intent 해석
- 방 생성 시 난이도/템플릿 추천
- 초대 대상 텍스트 해석
- 디버깅 피드백 문구
- 힌트 요약, 실패 원인 설명, 시스템 알림 문안

### 11.2 서버가 결정하는 것

- 방 생성 가능 여부
- 초대 대상 유효성
- 방 참가 가능 여부
- 게임 시작 가능 여부
- 현재 턴 사용자
- 턴 종료 시점
- 스트라이크 증가 여부
- 단계 클리어 여부
- 최종 게임 종료 여부

### 11.3 AI 사용 정책

- AI 응답은 기록 가능한 요청/응답 단위로 저장한다.
- AI가 잘못된 intent를 반환해도 서버는 도메인 검증을 통과한 경우에만 상태를 바꾼다.
- AI 실패 시에도 핵심 게임 진행은 서버 규칙 기반으로 계속될 수 있어야 한다.

### 11.4 힌트 정책

- 현재 명세 기준 힌트는 실시간 생성값이 아니라 `mission_template_step.hint_text` 기반 조회를 우선한다.
- 추가 AI 힌트는 보조 기능으로 붙일 수 있지만, MVP 필수 계약은 고정 힌트 조회다.

---

## 12. 보안 설계

### 12.1 인증

- 모든 API는 기본적으로 `Bearer {accessToken}` 필요
- access token은 짧은 만료 시간
- refresh token은 DB 해시 저장

### 12.2 인가

인가 원칙:

- 채팅 세션은 본인 세션만 조회 가능
- 방 조회는 본인이 소속된 방만 허용
- 초대 수락/거절은 본인 participant만 허용
- 게임 시작은 방장만 허용
- 턴 제출은 현재 턴 플레이어만 허용

### 12.3 리소스 접근 검증

모든 검증은 Guard가 아니라 Service 레이어에서 수행한다.

예:

- `participant.userId === currentUserId`
- `gameRoom.ownerUserId === currentUserId`
- `turn.playerUserId === currentUserId`

### 12.4 민감 정보 보호

- 비밀번호 원문 저장 금지
- refresh token 원문 저장 금지
- access token / refresh token 로그 출력 금지
- 실행 환경 비밀값이 stdout/stderr에 섞이지 않도록 필터링 정책 고려

### 12.5 외부 연동 키 관리

- LLM API 키, 런타임 접근 키는 환경변수로 관리
- 코드와 로그에 원문 노출 금지

---

## 13. 성능 및 실시간 처리 고려사항

### 13.1 코드 동기화와 영속 저장 분리

- 모든 코드 변경을 DB에 저장하지 않는다.
- 협업 중 변경은 delta 기반 전파
- 저장은 턴 종료 스냅샷 기준

이 분리를 지키지 않으면 DB 쓰기량과 복구 복잡도가 급격히 증가한다.

### 13.2 Docker 실행 지연과 타임아웃

- 컨테이너 기동 지연이 턴 진행 전체를 막을 수 있다.
- 실행 요청과 판정 타임아웃을 별도 설정해야 한다.
- 컨테이너 준비는 가급적 게임 시작 시 선행한다.

### 13.3 AI 응답 실패 fallback

- AI 피드백 생성 실패가 턴 완료 자체를 막아서는 안 된다.
- 서버는 최소한 실행 결과와 규칙 기반 판정만으로도 턴 전이를 진행할 수 있어야 한다.
- AI 실패 시 사용자에게는 “판정은 완료되었으나 부가 피드백은 생성되지 않음” 정도의 시스템 메시지를 보낸다.

### 13.4 WebSocket 재접속 복구

재접속 시 서버는 다음 상태를 재전송할 수 있어야 한다.

- 참가자 목록
- 현재 게임 상태
- 현재 미션 단계
- 현재 턴 정보
- 최근 스냅샷 또는 편집 가능한 최신 상태

MVP에서는 “최신 authoritative snapshot + 현재 턴 메타데이터” 기준 복구를 권장한다.

### 13.5 타이머 정확도

- 클라이언트 타이머는 표시용
- 실제 마감 시각 판정은 서버 기준
- 다중 인스턴스 환경 확장 시 Redis 기반 스케줄 보조가 필요할 수 있다

---

## 14. 테스트 전략

### 14.1 단위 테스트

대상:

- auth service
- AI chat intent mapper / validator
- game room start validation
- participant invite / join / deny validation
- turn submit validation
- mission result aggregation
- runtime / LLM integration adapter mapper

### 14.2 통합 테스트

대상:

- 게임 시작 시 미션/턴 초기화
- 초대 수락/거절 상태 전이
- 턴 제출 시 snapshot / execution / result 저장
- 방장 권한 검증
- 힌트 조회

### 14.3 WebSocket 시나리오 테스트

- `join-room` 후 초기 상태 수신
- `code-change` -> `code-updated` 브로드캐스트
- `turn-submit` -> `turn-evaluated` -> `turn-changed`
- `game-started` 수신 후 화면 전환 가능 상태 확인

### 14.4 문서 기준 검증 시나리오

- 회원가입 -> 로그인 -> 메인 진입
- AI 채팅으로 방 생성 -> 초대 -> 수락 -> 시작
- 턴 진행 중 코드 동기화 -> 제출 -> 실패 판정 -> 다음 턴
- 마지막 턴 제출 -> 최종 결과 브로드캐스트 -> 종료
- 힌트 조회 / AI 피드백 실패 / Docker 실행 실패 / WebSocket 재접속

---

## 15. 구현 순서 및 마일스톤

### 15.1 병렬 개발 원칙

- 3명의 개발자가 동시에 작업할 수 있도록 "공통 기반", "도메인/게임 상태", "실시간/외부 연동"으로 축을 분리한다.
- 한 개발자가 소유하는 모듈 경계는 가급적 겹치지 않게 유지하되, 공통 DTO/enum은 Phase 1에서 먼저 합의 후 고정한다.
- `api-spec.md`, `erd.md`, `folder-structure.md`를 먼저 동기화한 뒤 구현을 시작해야 병렬 작업 중 충돌을 줄일 수 있다.
- WebSocket payload, enum 상태값, 공통 에러 코드, response wrapper는 선행 합의 대상이다.

### 15.2 Phase 1. 공통 기반과 계약 고정

- NestJS 프로젝트 구조 생성
- `src/common`, `src/database`, `src/integrations`, `src/shared`, `src/modules` 기본 뼈대 생성
- DB 연결 / migration / seed 전략 고정
- 공통 응답 래퍼, 예외 처리, requestId 처리
- 공통 enum, 에러 코드, DTO 네이밍 규칙 확정
- 인증 가드/JWT/환경변수 로딩 방식 고정

### 15.3 Phase 2. 개발자별 병렬 작업 스트림 시작

**Developer A. 인증 / 메인 진입 / AI 채팅**

- auth 모듈 구현
- `GET /v1/auth/check-nickname`
- `POST /v1/auth/signup`
- `POST /v1/auth/login`
- `POST /v1/auth/refresh-token`
- `GET /v1/ai-chat-sessions`
- `GET /v1/ai-chat-sessions/{aiChatSessionId}/messages`
- `POST /v1/ai-chat-sessions/{aiChatSessionId}/messages`
- AI intent -> command DTO 매핑과 검증 로직

**Developer B. 방 / 참가자 / 게임 상태**

- `game-rooms` 조회 모듈 구현
- `game-room-participants` 조회/상태 전이 모듈 구현
- 방 생성 처리
- 초대 생성 / 수락 / 거절 처리
- 게임 시작 validation
- `game_room`, `game_room_participants`, `game_room_missions`, `game_room_mission_steps` 초기화 로직

**Developer C. 실시간 / 실행 / 판정 기반**

- WebSocket gateway 골격 구현
- `join-room`, `code-change`, `turn-submit` 이벤트 입구 구현
- runtime integration 인터페이스 정의
- execution 저장 모델 구현
- Redis 세션 캐시 전략 초안
- 재접속 시 최신 상태 재동기화 방식 초안

### 15.4 Phase 3. 게임 진행 핵심 파이프라인 완성

**Developer A**

- AI 채팅 결과와 방 생성/초대/시작 API 연결
- assistant message metadata 규격 고정
- 시스템 메시지/실패 메시지 정책 구현

**Developer B**

- 게임 시작 트랜잭션 구현
- 턴 생성 / 턴 종료 / 다음 턴 전이 구현
- `turns`, `turn_snapshots`, `mission_results` 도메인 로직 구현
- 단계 성공/실패에 따른 `strike_count`, `current_step_id`, `finished_at` 반영

**Developer C**

- `room-participants-updated`
- `game-started`
- `code-updated`
- `turn-evaluated`
- `turn-changed`
- `game-state-updated`
- `mission-result`
- 브로드캐스트 순서 보장과 재접속 복구 처리

### 15.5 Phase 4. 외부 연동과 판정 보강

**Developer A**

- AI 피드백 / 디버깅 / 힌트 메시지 포맷 정리
- prompt template 관리 방식 구현
- AI 실패 fallback UX 시스템 메시지 처리

**Developer B**

- mission template / step seed 정리
- 판정 집계 규칙 구현
- 힌트 조회 API 구현
- 상태 전이 예외 케이스 테스트 보강

**Developer C**

- Docker/container runtime 실제 연동
- 실행 상태 `PENDING -> RUNNING -> SUCCESS/FAILED/TIMEOUT` 반영
- stdout/stderr/exitCode 수집
- MQ 사용 시 consumer 분리 또는 동기 호출 경계 구현

### 15.6 Phase 5. 안정화와 통합 검증

- 문서 기준 E2E 시나리오 점검
- WebSocket 재접속 / 타임아웃 / 중복 제출 / 권한 오류 검증
- 상태명 불일치 제거
- 운영 로그 / 관측성 / 에러 코드 정리
- 테스트 누락 영역 보강

### 15.7 병렬 개발 시 선행 합의 체크리스트

- `TurnStatus` 최종 enum
- `GameRoomStatus`의 `JUDGING`, `ANALYZED` 노출 정책
- 실시간 코드 동기화 기술 선택
- Docker 실행의 동기/비동기 경계
- prompt template 저장 위치
- 타임아웃 시 자동 제출 정책

---

## 16. 결정 사항 및 오픈 이슈

### 16.1 확정된 구현 기준

- 백엔드 중심으로 작성하며, 프론트는 API/WebSocket 소비 규칙까지만 다룬다.
- 서버는 NestJS 단일 애플리케이션 + WebSocket 게이트웨이 구조를 기준으로 한다.
- 게임 상태 전이는 서버가 authoritative하게 결정한다.
- AI는 intent 해석과 피드백을 담당하지만 최종 상태를 결정하지 않는다.
- 코드 영속 저장 기준은 턴 종료 시점 스냅샷이다.

### 16.2 저장소 기준 사실(Repository Facts)

- 현재 저장소에는 실행 가능한 백엔드 소스가 없고, 설계 문서만 존재한다.
- 구현 기준 문서로는 `docs/etc/api-spec.md`, `docs/etc/erd.md`, `docs/etc/folder-structure.md`, `docs/etc/project-plan.md`, `docs/etc/sequence-diagram.md`, `docs/etc/user-flow.md`가 있다.
- `README.md`에는 별도 구현 지침이 없으므로, 본 문서가 사실상 구현 착수 기준 문서 역할을 한다.
- `folder-structure.md`는 `src/common`, `src/database`, `src/integrations`, `src/shared`, `src/modules` 구조를 전제로 한다.
- `erd.md`에는 `turns.status`가 `TIMEOUT`으로 기재되어 있고, `api-spec.md`에는 `EXPIRED`가 기재되어 있어 문서 간 불일치가 존재한다.

### 16.3 왜 이 구조를 택하는가

- 실시간 협업과 게임 규칙을 동시에 만족하려면 authoritative state가 필요하다.
- AI를 게임 룰 엔진과 분리해야 예측 가능성과 복구 가능성이 생긴다.
- 코드 delta와 스냅샷을 분리해야 성능과 단순성을 모두 지킬 수 있다.

### 16.4 만족해야 하는 기준

- 외부 계약은 `api-spec.md`와 일치해야 한다.
- 저장 모델은 `erd.md`와 최대한 일치해야 한다.
- 폴더 구조와 계층 책임은 `folder-structure.md`를 따라야 한다.
- 게임 시작, 턴 제출, 판정 반영은 서버 트랜잭션 경계 안에서 일관되게 처리해야 한다.

### 16.5 위험 구간

- AI intent 오판
- 컨테이너 준비 지연 또는 실행 실패
- 턴 타이머와 실시간 브로드캐스트 타이밍 엇갈림
- 재접속 시점의 상태 복구 불일치
- ERD와 API 명세의 상태명 불일치

### 16.6 사람이 최종 판단해야 하는 영역

- 미션 템플릿의 실제 판정 정책 상세
- 타임아웃 시 snapshot 저장 여부와 자동 제출 정책
- MQ를 MVP에서 실제 사용할지 여부
- AI 피드백 실패 시 사용자 UX 상세
- 컨테이너 수명주기 정리 정책

### 16.7 트랜잭션 경계

다음 작업은 단일 트랜잭션 또는 명시적 일관성 경계로 취급한다.

- 회원가입 + refresh token 저장
- 방 생성 + 방장 participant 생성
- 초대 수락 / 거절에 따른 participant 상태 변경
- 게임 시작 시 `game_room`, `game_room_mission`, `mission_step`, `turn` 초기화
- 턴 제출 시 `turn_snapshot` 저장 + `turn.status` 변경
- 판정 결과 반영 시 `strike_count`, `step.status`, `game_room.status` 변경

실행 요청과 AI 피드백 생성처럼 외부 시스템이 끼는 작업은 별도 일관성 경계로 보고, DB 상태와 결과 반영 시점을 명확히 분리한다.

### 16.8 가정(Assumptions)

- MVP에서는 단일 리전, 단일 백엔드 배포를 우선 가정한다.
- 초기 구현은 PostgreSQL + Redis 조합으로 충분하며, MQ는 필요 시 확장 포인트로 남겨둔다.
- 미션 판정은 "서버 규칙 기반 판정 우선, AI 피드백 보조" 구조를 기본값으로 둔다.
- 프롬프트 템플릿은 초기에 seed 또는 정적 리소스로 시작해도 무방하다고 가정한다.
- 실시간 코드 동기화는 초기에는 단순 delta 이벤트 방식으로 시작하고, 충돌 문제가 확인되면 CRDT 도입을 재검토한다.

### 16.9 오픈 이슈

1. `TurnStatus`는 `api-spec.md`의 `EXPIRED`와 `erd.md`의 `TIMEOUT` 중 하나로 통일이 필요하다.
2. `GameRoomStatus`의 `JUDGING`, `ANALYZED`를 어떤 시점에 노출할지 UI 정책이 추가로 필요하다.
3. 실시간 코드 동기화를 Yjs 같은 CRDT로 구현할지, 단순 delta 이벤트로 구현할지 기술 선택이 남아 있다.
4. Docker 실행 요청을 동기 호출로 처리할지 MQ 기반 비동기 처리로 분리할지 확정이 필요하다.
5. AI prompt template을 DB 관리로 둘지 정적 파일 seed 중심으로 둘지 운영 정책 확정이 필요하다.
