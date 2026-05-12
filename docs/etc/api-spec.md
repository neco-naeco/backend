# Relay Coding Server API Specification v1.2

## 공통 안내

> 이 문서는 `api.md`와 `api2.md`를 통합한 최종 API 명세입니다.
> 프론트엔드 구현 기준으로 다음 범위를 포함합니다.
> - 회원가입 / 로그인 / 토큰 재발급
> - 메인 화면 진입
> - AI 채팅을 통한 방 생성 / 방 참가 / 게임 시작 준비
> - 게임 시작 API
> - AI 힌트 API
> - 실시간 WebSocket 이벤트
>
> 범위 제외:
> - 랭킹 / 통계 / 회고 화면 API
> - 결제 / 상점 / 업적 API
> - 코드 실행 / AI 디버깅 HTTP API

### 인증
모든 API는 인증이 필요합니다.

인증 예외:
- `GET /v1/auth/check-nickname`
- `POST /v1/auth/signup`
- `POST /v1/auth/login`
- `POST /v1/auth/refresh-token`

### Content-Type
`application/json`

### Authorization
`Bearer {accessToken}`

### Base URL
`/v1`

### HTTP Status Codes
- `200`: Success
- `201`: Created
- `204`: No Content
- `400`: Bad Request
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `409`: Conflict
- `500`: Internal Server Error

### Response Wrapper
모든 HTTP 응답은 아래 공통 구조를 따른다.

#### Success
- `data`: object | array
- `meta`: object
  - `requestId`: string
- `error`: null

#### Error
- `data`: null
- `meta`: object
  - `requestId`: string
- `error`: object
  - `code`: string
  - `message`: string

### Naming Convention
- Request / Response JSON 필드는 `camelCase`를 사용한다.
- URL path는 리소스 중심, 복수형, `kebab-case`를 사용한다.
- DB 컬럼명은 ERD 기준 `snake_case`이지만 외부 API로 그대로 노출하지 않는다.

## Domain Constants

### AiChatSessionStatus
- `ACTIVE`
- `CLOSED`
- `ERROR`

### AiChatRequestType
- `ROOM_CREATE`
- `USER_INVITE`
- `ROOM_JOIN`
- `USER_INVITE_DENY`
- `GAME_START`

### AiChatRequestStatus
- `RECEIVED`
- `COMPLETED`
- `FAILED`

### AiChatMessageSenderType
- `USER`
- `ASSISTANT`
- `SYSTEM`

### AiChatMessageType
- `TEXT`
- `COMMAND_RESULT`
- `SYSTEM_NOTICE`

### RoomCommandStatus
- `PENDING`
- `SUCCESS`
- `FAILED`

### GameRoomStatus
- `WAITING`
- `IN_PROGRESS`
- `JUDGING`
- `ANALYZED`
- `FINISHED`

### TurnStatus
- `IN_PROGRESS`
- `SUBMITTED`
- `EXPIRED`
- `COMPLETED`

### ExecutionStatus
- `SUCCESS`
- `FAILED`
- `TIMEOUT`

### GameAiRequestType
- `DEBUG`
- `JUDGE`

### PresenceStatus
- `ONLINE`
- `OFFLINE`
- `ACTIVE`
- `IDLE`

### AiRealtimeEventType
- `SYSTEM_NOTIFICATION`
- `HINT_POPUP`
- `DEBUG_SUMMARY`
- `MISSION_FEEDBACK`
- `MISSION_RESULT`

## Error Codes

### Common
- `VALIDATION_ERROR`
- `UNAUTHORIZED`
- `FORBIDDEN_RESOURCE_ACCESS`
- `INTERNAL_SERVER_ERROR`

### Auth
- `AUTH_LOGIN_ID_CONFLICT`
- `AUTH_EMAIL_CONFLICT`
- `AUTH_NICKNAME_CONFLICT`
- `AUTH_INVALID_CREDENTIALS`
- `AUTH_TOKEN_INVALID`
- `AUTH_TOKEN_EXPIRED`
- `AUTH_REFRESH_TOKEN_REVOKED`

### AI Chat
- `AI_CHAT_SESSION_NOT_FOUND`
- `AI_CHAT_REQUEST_NOT_FOUND`
- `AI_CHAT_COMMAND_NOT_SUPPORTED`
- `AI_CHAT_COMMAND_EXECUTION_FAILED`
- `INVITATION_NOT_FOUND`
- `INVITATION_ALREADY_PROCESSED`
- `ROOM_INVITE_FORBIDDEN`
- `USER_NOT_FOUND`
- `USER_ALREADY_IN_ROOM`

### Room Integration
- `ROOM_NOT_FOUND`
- `ROOM_ALREADY_JOINED`
- `ROOM_START_FORBIDDEN`
- `ROOM_START_CONDITION_NOT_MET`

### Gameplay
- `GAME_ROOM_NOT_FOUND`
- `MISSION_NOT_FOUND`
- `TURN_NOT_FOUND`
- `AI_HINT_NOT_AVAILABLE`

---

## 1. GET /auth/check-nickname

### 목적
회원가입 시 닉네임 중복 여부를 확인한다.

### Query Parameter
- `nickname`: string (required)

### Request Example
`GET /v1/auth/check-nickname?nickname=코딩고수`

### Response

#### Success
```json
{
  "data": {
    "isAvailable": true
  },
  "meta": {
    "requestId": "6f1d7e14-6d74-4c74-97b1-6ef7a7df1001"
  },
  "error": null
}
```

#### Error
```json
{
  "data": null,
  "meta": {
    "requestId": "6f1d7e14-6d74-4c74-97b1-6ef7a7df1001"
  },
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "nickname is required"
  }
}
```

---

## 2. POST /auth/signup

### 목적
새로운 사용자 계정을 생성한다.

### Body
- `loginId`: string (required)
- `nickname`: string (required)
- `passwordHash`: string (required)
- `email`: string | null (optional)

### Request Example
```json
{
  "loginId": "user123",
  "nickname": "코딩고수",
  "passwordHash": "hashed-password",
  "email": "user@example.com"
}
```

### Response

#### Success
```json
{
  "data": {
    "userId": "550e8400-e29b-41d4-a716-446655440001",
    "loginId": "user123",
    "nickname": "코딩고수",
    "email": "user@example.com",
    "createdAt": "2026-05-04T09:00:00Z"
  },
  "meta": {
    "requestId": "6f1d7e14-6d74-4c74-97b1-6ef7a7df1002"
  },
  "error": null
}
```

#### Error
```json
{
  "data": null,
  "meta": {
    "requestId": "6f1d7e14-6d74-4c74-97b1-6ef7a7df1002"
  },
  "error": {
    "code": "AUTH_LOGIN_ID_CONFLICT",
    "message": "loginId already exists"
  }
}
```

---

## 3. POST /auth/login

### 목적
로그인을 수행하고 access token과 refresh token을 발급한다.

### Body
- `loginId`: string (required)
- `passwordHash`: string (required)

### Request Example
```json
{
  "loginId": "user123",
  "passwordHash": "hashed-password"
}
```

### Response

#### Success
```json
{
  "data": {
    "accessToken": "jwt-access-token",
    "refreshToken": "refresh-token",
    "user": {
      "userId": "550e8400-e29b-41d4-a716-446655440001",
      "loginId": "user123",
      "nickname": "코딩고수",
      "email": "user@example.com"
    }
  },
  "meta": {
    "requestId": "6f1d7e14-6d74-4c74-97b1-6ef7a7df1003"
  },
  "error": null
}
```

#### Error
```json
{
  "data": null,
  "meta": {
    "requestId": "6f1d7e14-6d74-4c74-97b1-6ef7a7df1003"
  },
  "error": {
    "code": "AUTH_INVALID_CREDENTIALS",
    "message": "Invalid loginId or password"
  }
}
```

---

## 4. POST /auth/refresh-token

### 목적
refresh token으로 access token을 재발급한다.

### Body
- `refreshToken`: string (required)

### Request Example
```json
{
  "refreshToken": "refresh-token"
}
```

### Response

#### Success
```json
{
  "data": {
    "accessToken": "new-jwt-access-token"
  },
  "meta": {
    "requestId": "6f1d7e14-6d74-4c74-97b1-6ef7a7df1004"
  },
  "error": null
}
```

#### Error
```json
{
  "data": null,
  "meta": {
    "requestId": "6f1d7e14-6d74-4c74-97b1-6ef7a7df1004"
  },
  "error": {
    "code": "AUTH_REFRESH_TOKEN_REVOKED",
    "message": "Refresh token has been revoked"
  }
}
```

---

## 5. GET /ai-chat-sessions

### 목적
메인 화면 진입 시 현재 사용자가 접근 가능한 AI 채팅 세션 목록을 복수 조회한다.

### 설명
- 단건 조회 대신 목록 조회로 사용한다.
- `userId`는 자기 자신 조회 용도로만 사용한다.
- `userId`를 전달하는 경우 access token의 사용자와 동일해야 한다.

### Query Parameter
- `gameRoomId`: string (optional)
- `userId`: string (optional)

### Request Example
`GET /v1/ai-chat-sessions?gameRoomId=550e8400-e29b-41d4-a716-446655440501&userId=550e8400-e29b-41d4-a716-446655440001`

### Response

#### Success
```json
{
  "data": [
    {
      "aiChatSessionId": "550e8400-e29b-41d4-a716-446655440101",
      "requesterUserId": "550e8400-e29b-41d4-a716-446655440001",
      "gameRoomId": "550e8400-e29b-41d4-a716-446655440501",
      "status": "ACTIVE",
      "provider": "openai",
      "llmModel": "gpt-5.4",
      "createdAt": "2026-05-04T09:10:00Z",
      "updatedAt": "2026-05-04T09:12:00Z",
      "closedAt": null
    }
  ],
  "meta": {
    "requestId": "6f1d7e14-6d74-4c74-97b1-6ef7a7df2002"
  },
  "error": null
}
```

#### Error
```json
{
  "data": null,
  "meta": {
    "requestId": "6f1d7e14-6d74-4c74-97b1-6ef7a7df2002"
  },
  "error": {
    "code": "FORBIDDEN_RESOURCE_ACCESS",
    "message": "userId does not match the authenticated user"
  }
}
```

---

## 6. GET /game-rooms

### 목적
메인 화면 진입 시 현재 사용자가 접근 가능한 게임방 목록을 복수 조회한다.

### 설명
- 프론트엔드는 응답 배열을 기준으로 메인 화면, 대기방 화면, 게임 화면 진입 여부를 판단한다.

### Query Parameter
- `userId`: string (required)
- `status`: string (optional)

### Request Example
`GET /v1/game-rooms?userId=550e8400-e29b-41d4-a716-446655440001&status=WAITING`

### Response

#### Success
```json
{
  "data": [
    {
      "gameRoomId": "550e8400-e29b-41d4-a716-446655440502",
      "title": "문자열 핸들링 릴레이 방",
      "status": "WAITING",
      "ownerUserId": "550e8400-e29b-41d4-a716-446655440001",
      "myRole": "OWNER",
      "myMembershipStatus": "JOINED",
      "joinedParticipantCount": 2,
      "minParticipants": 2,
      "maxParticipants": 4,
      "createdAt": "2026-05-04T09:11:21Z",
      "updatedAt": "2026-05-04T09:12:10Z"
    }
  ],
  "meta": {
    "requestId": "6f1d7e14-6d74-4c74-97b1-6ef7a7df2003"
  },
  "error": null
}
```

### Frontend Handling
- `status = WAITING` 방이 있으면 대기방 진입을 준비한다.
- `status = IN_PROGRESS` 방이 있으면 게임 화면 재진입을 준비한다.
- 빈 배열이면 AI 채팅 기반 방 생성 유도 UI를 노출한다.

---

## 7. GET /game-room-participants

### 목적
현재 사용자의 방 참가/초대 상태를 `game_room_participants` 기준으로 복수 조회한다.

### 설명
- `status = INVITED` 필터를 사용하면 초대 목록 조회 용도로 사용할 수 있다.

### Query Parameter
- `gameRoomId`: string (optional)
- `userId`: string (optional)
- `role`: string (optional)
- `status`: string (optional)

### Request Example
`GET /v1/game-room-participants?userId=550e8400-e29b-41d4-a716-446655440002&status=INVITED`

### Response

#### Success
```json
{
  "data": [
    {
      "participantId": "550e8400-e29b-41d4-a716-446655440601",
      "gameRoomId": "550e8400-e29b-41d4-a716-446655440502",
      "gameRoomTitle": "문자열 핸들링 릴레이 방",
      "userId": "550e8400-e29b-41d4-a716-446655440002",
      "nickname": "수민",
      "role": "PARTICIPANT",
      "status": "INVITED",
      "roomStatus": "WAITING",
      "createdAt": "2026-05-04T09:11:40Z"
    }
  ],
  "meta": {
    "requestId": "6f1d7e14-6d74-4c74-97b1-6ef7a7df2005"
  },
  "error": null
}
```

### Frontend Handling
- `status = INVITED` 항목만 추려 초대 카드 목록을 렌더링한다.
- 각 항목의 `gameRoomId`, `userId`, `role`, `status`를 기준으로 수락/거절 UI를 구성한다.

---

## 8. GET /ai-chat-sessions/{aiChatSessionId}/messages

### 목적
AI 채팅 메시지 목록을 조회한다.

### Path Parameter
- `aiChatSessionId`: string (required)

### Request Example
`GET /v1/ai-chat-sessions/550e8400-e29b-41d4-a716-446655440101/messages`

### Response

#### Success
```json
{
  "data": [
    {
      "messageId": "550e8400-e29b-41d4-a716-446655440120",
      "aiChatRequestId": null,
      "senderType": "ASSISTANT",
      "messageType": "SYSTEM_NOTICE",
      "content": "안녕하세요! 무엇을 도와드릴까요?",
      "metadata": null,
      "createdAt": "2026-05-04T09:10:00Z"
    },
    {
      "messageId": "550e8400-e29b-41d4-a716-446655440121",
      "aiChatRequestId": "550e8400-e29b-41d4-a716-446655440201",
      "senderType": "USER",
      "messageType": "TEXT",
      "content": "방 만들어줘",
      "metadata": null,
      "createdAt": "2026-05-04T09:11:00Z"
    }
  ],
  "meta": {
    "requestId": "6f1d7e14-6d74-4c74-97b1-6ef7a7df2003"
  },
  "error": null
}
```

---

## 9. POST /ai-chat-sessions/{aiChatSessionId}/messages

### 목적
사용자 메시지를 AI에 전달하고, 방 생성 / 방 참가 / 초대 거절 / 게임 시작 준비 의도를 해석해 대화 상태를 진행시킨다.

### Path Parameter
- `aiChatSessionId`: string (required)

### Body
- `message`: string (required)

### 응답 해석 규칙
- `requestType`은 서버가 해석한 사용자 의도다.
- `commandResult.apiPath`는 실제 후속 도메인 API path다.
- `commandResult.status = PENDING`이면 아직 최종 실행 전이다.
- `commandResult.status = SUCCESS`이면 해당 단계의 실행이 완료된 상태다.

### Request Example
```json
{
  "message": "쉬운 난이도로 방 만들어주고 바로 시작 준비해줘"
}
```

### Response

#### Success Schema
- `aiChatRequestId`: string
- `requestType`: string
- `requestStatus`: string
- `userMessage`: object
- `assistantMessage`: object
- `commandResult`: object | null
  - `commandType`: string
  - `status`: string
  - `apiPath`: string | null
  - `gameRoomId`: string | null
  - `title`: string | null
  - `participants`: array | null
  - `started`: boolean | null

#### Example - ROOM_CREATE
```json
{
  "data": {
    "aiChatRequestId": "550e8400-e29b-41d4-a716-446655440201",
    "requestType": "ROOM_CREATE",
    "requestStatus": "COMPLETED",
    "userMessage": {
      "messageId": "550e8400-e29b-41d4-a716-446655440121",
      "senderType": "USER",
      "messageType": "TEXT",
      "content": "쉬운 난이도 방 만들어줘",
      "createdAt": "2026-05-04T09:11:00Z"
    },
    "assistantMessage": {
      "messageId": "550e8400-e29b-41d4-a716-446655440122",
      "senderType": "ASSISTANT",
      "messageType": "COMMAND_RESULT",
      "content": "쉬운 난이도로 만들 수 있는 방 목록이에요. 원하는 방을 선택해주세요.",
      "metadata": {
        "difficulty": "EASY",
        "templates": [
          {
            "templateId": "template-easy-01",
            "title": "기초 산술 연산",
            "description": "덧셈, 뺄셈, 곱셈, 나눗셈 중심의 입문용 문제",
            "difficulty": "EASY"
          }
        ]
      },
      "createdAt": "2026-05-04T09:11:01Z"
    },
    "commandResult": {
      "commandType": "ROOM_CREATE",
      "status": "PENDING",
      "apiPath": "/v1/game-rooms",
      "gameRoomId": null,
      "title": null,
      "participants": null,
      "started": null
    }
  },
  "meta": {
    "requestId": "6f1d7e14-6d74-4c74-97b1-6ef7a7df2004"
  },
  "error": null
}
```

#### Example - ROOM_JOIN
```json
{
  "data": {
    "aiChatRequestId": "550e8400-e29b-41d4-a716-446655440202",
    "requestType": "ROOM_JOIN",
    "requestStatus": "COMPLETED",
    "userMessage": {
      "messageId": "550e8400-e29b-41d4-a716-446655440123",
      "senderType": "USER",
      "messageType": "TEXT",
      "content": "문자열 핸들링 릴레이 방 초대 수락할게",
      "createdAt": "2026-05-04T09:12:00Z"
    },
    "assistantMessage": {
      "messageId": "550e8400-e29b-41d4-a716-446655440124",
      "senderType": "ASSISTANT",
      "messageType": "COMMAND_RESULT",
      "content": "초대를 수락했고 방 참가를 완료했어요.",
      "metadata": {
        "joinSource": "INVITATION_ACCEPT",
        "membershipStatus": "JOINED",
        "gameRoomId": "550e8400-e29b-41d4-a716-446655440502",
        "title": "문자열 핸들링 릴레이 방"
      },
      "createdAt": "2026-05-04T09:12:01Z"
    },
    "commandResult": {
      "commandType": "ROOM_JOIN",
      "status": "SUCCESS",
      "apiPath": "/v1/game-room-participants/550e8400-e29b-41d4-a716-446655440601/join",
      "gameRoomId": "550e8400-e29b-41d4-a716-446655440502",
      "title": "문자열 핸들링 릴레이 방",
      "participants": ["방장", "코딩고수"],
      "started": false
    }
  },
  "meta": {
    "requestId": "6f1d7e14-6d74-4c74-97b1-6ef7a7df2005"
  },
  "error": null
}
```

#### Example - USER_INVITE
```json
{
  "data": {
    "aiChatRequestId": "550e8400-e29b-41d4-a716-446655440204",
    "requestType": "USER_INVITE",
    "requestStatus": "COMPLETED",
    "commandResult": {
      "commandType": "USER_INVITE",
      "status": "SUCCESS",
      "apiPath": "/v1/game-rooms/550e8400-e29b-41d4-a716-446655440501/invite",
      "gameRoomId": "550e8400-e29b-41d4-a716-446655440501",
      "title": "기초 산술 연산 릴레이 방",
      "participants": ["코딩고수", "민수"],
      "started": false
    }
  },
  "meta": {
    "requestId": "6f1d7e14-6d74-4c74-97b1-6ef7a7df2007"
  },
  "error": null
}
```

#### Example - USER_INVITE_DENY
```json
{
  "data": {
    "aiChatRequestId": "550e8400-e29b-41d4-a716-446655440205",
    "requestType": "USER_INVITE_DENY",
    "requestStatus": "COMPLETED",
    "commandResult": {
      "commandType": "USER_INVITE_DENY",
      "status": "SUCCESS",
      "apiPath": "/v1/game-room-participants/550e8400-e29b-41d4-a716-446655440601/deny",
      "gameRoomId": "550e8400-e29b-41d4-a716-446655440502",
      "title": "문자열 핸들링 릴레이 방",
      "participants": null,
      "started": false
    }
  },
  "meta": {
    "requestId": "6f1d7e14-6d74-4c74-97b1-6ef7a7df2008"
  },
  "error": null
}
```

#### Example - GAME_START
```json
{
  "data": {
    "aiChatRequestId": "550e8400-e29b-41d4-a716-446655440203",
    "requestType": "GAME_START",
    "requestStatus": "COMPLETED",
    "commandResult": {
      "commandType": "GAME_START",
      "status": "SUCCESS",
      "apiPath": "/v1/game-rooms/550e8400-e29b-41d4-a716-446655440502/start",
      "gameRoomId": "550e8400-e29b-41d4-a716-446655440502",
      "title": "문자열 핸들링 릴레이 방",
      "participants": ["방장", "코딩고수"],
      "started": true
    }
  },
  "meta": {
    "requestId": "6f1d7e14-6d74-4c74-97b1-6ef7a7df2006"
  },
  "error": null
}
```

#### Error
```json
{
  "data": null,
  "meta": {
    "requestId": "6f1d7e14-6d74-4c74-97b1-6ef7a7df2006"
  },
  "error": {
    "code": "ROOM_START_CONDITION_NOT_MET",
    "message": "The game cannot start until the minimum number of players has joined"
  }
}
```

### Frontend Handling
1. 사용자 입력을 채팅 메시지로 보낸다.
2. `requestType`, `commandResult.status`, `commandResult.apiPath`, `assistantMessage.metadata`를 기준으로 다음 UI를 결정한다.
3. 방 생성 또는 참가 완료 후에는 게임방 및 WebSocket 이벤트 중심으로 상태를 갱신한다.

---

## 10. POST /game-rooms/{gameRoomId}/start

### 목적
특정 게임방에서 선택한 미션 템플릿 기준으로 게임을 시작한다.

### Path Parameter
- `gameRoomId`: string (required)

### Body
- `missionTemplateId`: string (optional)
  - AI 채팅 단계에서 이미 템플릿이 확정된 경우 생략 가능

### Request Example
`POST /v1/game-rooms/room-001/start`

### Response

#### Success
```json
{
  "data": {
    "success": true
  },
  "meta": {
    "requestId": "6f1d7e14-6d74-4c74-97b1-6ef7a7df3001"
  },
  "error": null
}
```

#### Error
```json
{
  "data": null,
  "meta": {
    "requestId": "6f1d7e14-6d74-4c74-97b1-6ef7a7df3001"
  },
  "error": {
    "code": "ROOM_START_CONDITION_NOT_MET",
    "message": "Game start conditions are not satisfied"
  }
}
```

### Frontend Handling
- 성공 응답을 받으면 별도 게임 정보 조회 없이 WebSocket 이벤트를 대기한다.
- 실제 게임 진입 정보와 초기 미션 상태는 `game-started`, `game-state-updated` 이벤트로 반영한다.

---

## 11. GET /game-room-missions/{missionId}/hints

### 목적
현재 미션의 현재 단계에 연결된 힌트를 조회한다.

### 설명
- 힌트는 AI가 실시간 생성하는 값이 아니라, 미션 템플릿 단계에 사전 정의된 값을 조회한다.
- 현재 미션의 진행 단계는 `game_room_missions.current_step_id`로 식별한다.

### Path Parameter
- `missionId`: string (required)

### Query Parameter
- `scope`: string (required)
  - `current-step` 고정

### Request Example
`GET /v1/game-room-missions/mission-001/hints?scope=current-step`

### Response

#### Success
```json
{
  "data": {
    "missionId": "mission-001",
    "gameRoomMissionStepId": "game-room-mission-step-001",
    "missionTemplateStepId": "mission-template-step-001",
    "hintText": "for문으로 numbers를 하나씩 확인하고, 조건문을 사용해보세요."
  },
  "meta": {
    "requestId": "6f1d7e14-6d74-4c74-97b1-6ef7a7df3003"
  },
  "error": null
}
```

#### Error
```json
{
  "data": null,
  "meta": {
    "requestId": "6f1d7e14-6d74-4c74-97b1-6ef7a7df3003"
  },
  "error": {
    "code": "MISSION_NOT_FOUND",
    "message": "Mission not found"
  }
}
```

### Frontend Handling
- 현재 단계에 연결된 힌트를 표시한다.
- 힌트 팝업 또는 채팅 메시지 형태로 출력한다.
- 사용자가 힌트를 조회한 기록을 상태에 저장한다.

---

## 12. WebSocket Events

실시간 협업과 게임 상태 동기화를 위한 WebSocket 이벤트 규약이다.

### 12.1 join-room

#### Direction
Client → Server

#### 목적
게임방 입장 시 실시간 세션을 연결한다.

#### Data
- `accessToken`: string
- `gameRoomId`: string
- `userId`: string

#### Example
```json
{
  "accessToken": "access-token",
  "gameRoomId": "room-001",
  "userId": "user-001"
}
```

#### Frontend Handling
- RoomPage 진입 시 전송한다.
- 방 입장 후 실시간 코드 동기화를 시작한다.

### 12.2 room-participants-updated

#### Direction
Server → Client

#### 목적
초기 참가자 목록 또는 참가 상태 변경을 동기화한다.

#### Data
- `gameRoomId`: string
- `participants`: array
- `changedParticipant`: object | null
- `gameState`: object
- `missionState`: object | null
- `occurredAt`: string

#### Example
```json
{
  "gameRoomId": "room-001",
  "participants": [
    {
      "userId": "user-001",
      "nickname": "성민",
      "role": "OWNER",
      "membershipStatus": "JOINED"
    },
    {
      "userId": "user-002",
      "nickname": "지연",
      "role": "PARTICIPANT",
      "membershipStatus": "LEFT"
    }
  ],
  "changedParticipant": {
    "userId": "user-002",
    "nickname": "지연",
    "role": "PARTICIPANT",
    "membershipStatus": "LEFT"
  },
  "gameState": {
    "status": "WAITING",
    "strikeCount": 3,
    "maxStrikeCount": 3
  },
  "missionState": null,
  "occurredAt": "2026-05-04T10:00:00"
}
```

#### Frontend Handling
- 참가자 목록을 저장한다.
- `membershipStatus`는 `INVITED`, `JOINED`, `LEFT`, `DENIED` 값을 사용한다.
- `changedParticipant`를 기준으로 최근 참가 상태 변경 UI를 갱신한다.
- 게임 상태를 저장한다.
- 대기 화면을 표시한다.

### 12.3 game-started

#### Direction
Server → Client

#### 목적
게임 시작 직후 초기 게임 상태, 미션 정보, 첫 턴 정보를 전달한다.

#### Data
- `gameRoomId`: string
- `gameState`: object
- `missionState`: object
- `uiHints`: object
- `occurredAt`: string

#### Example
```json
{
  "gameRoomId": "room-001",
  "gameState": {
    "status": "IN_PROGRESS",
    "strikeCount": 0,
    "maxStrikeCount": 3,
    "turnState": {
      "turnId": "turn-001",
      "turnNumber": 1,
      "currentPlayerId": "user-001",
      "startedAt": "2026-05-04T10:10:00",
      "deadlineAt": "2026-05-04T10:10:30",
      "timeLimitSeconds": 30,
      "remainingTimeSeconds": 30,
      "status": "IN_PROGRESS"
    }
  },
  "missionState": {
    "missionId": "mission-001",
    "missionTemplateId": "mission-template-001",
    "title": "짝수 찾기",
    "description": "짝수만 반환하세요",
    "language": "python",
    "difficulty": "EASY",
    "status": "IN_PROGRESS"
  },
  "uiHints": {
    "enterGameScreen": true,
    "showMissionGuideModal": true
  },
  "occurredAt": "2026-05-04T10:10:00"
}
```

#### Frontend Handling
- 게임 화면으로 전환한다.
- 미션 안내 모달을 표시한다.
- `projectStructure.files` 기준으로 에디터 파일 탭을 구성한다.
- 현재 턴 사용자와 타이머를 초기화한다.

### 12.4 code-change

#### Direction
Client → Server

#### 목적
코드 변경분을 실시간 동기화용으로 전송한다.

#### Data
- `gameRoomId`: string
- `userId`: string
- `sessionId`: string
- `filePath`: string
- `codeDelta`: string
- `occurredAt`: string

#### Example
```json
{
  "gameRoomId": "room-001",
  "userId": "user-001",
  "sessionId": "session-001",
  "filePath": "main.py",
  "codeDelta": "Yjs 변경 데이터",
  "occurredAt": "2026-05-04T10:12:00"
}
```

#### Frontend Handling
- 코드 변경 시 전송한다.
- 저장 목적이 아니라 실시간 동기화 목적이다.
- 실제 저장은 턴 종료 시점에 처리한다.

### 12.5 code-updated

#### Direction
Server → Client

#### 목적
다른 참가자의 코드 변경분을 전달한다.

#### Data
- `gameRoomId`: string
- `userId`: string
- `filePath`: string
- `codeDelta`: string
- `occurredAt`: string

#### Example
```json
{
  "gameRoomId": "room-001",
  "userId": "user-002",
  "filePath": "main.py",
  "codeDelta": "Yjs 변경 데이터",
  "occurredAt": "2026-05-04T10:12:01"
}
```

#### Frontend Handling
- 다른 참가자의 코드 변경분을 에디터에 반영한다.
- 내가 보낸 변경분은 중복 적용하지 않도록 처리한다.

### 12.6 turn-submit

#### Direction
Client → Server

#### 목적
현재 턴의 코드 스냅샷을 제출한다.

#### Data
- `gameRoomId`: string
- `userId`: string
- `turnId`: string
- `codeSnapshot`: object
- `submittedAt`: string

#### Example
```json
{
  "gameRoomId": "room-001",
  "userId": "user-001",
  "turnId": "turn-001",
  "codeSnapshot": {
    "files": [
      {
        "filePath": "main.py",
        "content": "print('hello')"
      }
    ]
  },
  "submittedAt": "2026-05-04T10:12:30"
}
```

#### Frontend Handling
- 턴 종료 버튼 클릭 시 전송한다.
- 전송 후 현재 사용자의 에디터 입력을 비활성화한다.
- 턴 판정 결과 이벤트와 다음 턴 변경 이벤트를 대기한다.

### 12.7 turn-evaluated

#### Direction
Server → Client

#### 목적
제출된 턴의 실행 및 판정 결과를 브로드캐스트한다.

#### Data
- `gameRoomId`: string
- `evaluatedTurn`: object
- `evaluationResult`: object
- `occurredAt`: string

#### Example
```json
{
  "gameRoomId": "room-001",
  "evaluatedTurn": {
    "turnId": "turn-001",
    "turnNumber": 1,
    "playerUserId": "user-001",
    "status": "SUBMITTED"
  },
  "evaluationResult": {
    "isStepCleared": false,
    "judgeStatus": "FAILED",
    "strikeCount": 1,
    "remainingStrikeCount": 2,
    "feedbackMessage": "짝수 조건이 적용되지 않았습니다.",
    "detectedIssues": [
      {
        "issueType": "LOGIC_ERROR",
        "message": "짝수 조건이 적용되지 않았습니다.",
        "filePath": "main.py",
        "lineNumber": 3
      }
    ],
    "executionSummary": {
      "status": "SUCCESS",
      "exitCode": 0,
      "stdout": "[1, 2, 3, 4, 5, 6]",
      "stderr": ""
    }
  },
  "occurredAt": "2026-05-04T10:12:31"
}
```

#### Frontend Handling
- 방금 종료된 턴의 검증 결과를 표시한다.
- 실패면 피드백, 스트라이크 수, 오류 위치 표시를 갱신한다.
- 성공이면 현재 단계 완료 상태를 반영한다.
- 이 이벤트는 다음 턴 시작 전, 방금 제출된 턴의 검증 결과를 의미한다.

### 12.8 turn-changed

#### Direction
Server → Client

#### 목적
다음 턴 시작과 현재 플레이어 변경을 알린다.

#### Data
- `gameRoomId`: string
- `missionState`: object
- `turnState`: object
- `nextPlayerId`: string
- `turnSnapshotId`: string

#### Example
```json
{
  "gameRoomId": "room-001",
  "missionState": {
    "missionId": "mission-001",
    "gameRoomMissionStepId": "game-room-mission-step-002",
    "missionTemplateStepId": "mission-template-step-002"
  },
  "turnState": {
    "turnId": "turn-002",
    "turnNumber": 2,
    "currentPlayerId": "user-002",
    "startedAt": "2026-05-04T10:12:31",
    "deadlineAt": "2026-05-04T10:13:01",
    "timeLimitSeconds": 30,
    "remainingTimeSeconds": 30,
    "status": "IN_PROGRESS"
  },
  "nextPlayerId": "user-002",
  "turnSnapshotId": "snapshot-001"
}
```

#### Frontend Handling
- 현재 턴 사용자를 변경한다.
- `currentPlayerId`와 내 `userId`가 같으면 에디터를 활성화한다.
- 그렇지 않으면 읽기 전용으로 전환한다.
- 타이머를 초기화한다.
- 이 이벤트는 이전 턴 검증 완료 이후 실제로 다음 턴이 시작되었음을 의미한다.

### 12.9 game-state-updated

#### Direction
Server → Client

#### 목적
게임 전체 상태와 미션 상태 변화를 동기화한다.

#### Data
- `gameRoomId`: string
- `gameState`: object
- `missionState`: object | null

#### Example
```json
{
  "gameRoomId": "room-001",
  "gameState": {
    "status": "IN_PROGRESS",
    "strikeCount": 1,
    "maxStrikeCount": 3
  }
}
```

#### Frontend Handling
- 게임 상태를 갱신한다.
- 목숨 또는 스트라이크 UI를 갱신한다.
- 미션 상태를 갱신한다.
- `FINISHED` 상태면 결과 화면으로 이동한다.

### 12.10 mission-result

#### Direction
Server → Client

#### 목적
게임 종료 시점의 최종 미션 판정 결과를 전달한다.

#### Data
- `gameRoomId`: string
- `gameState`: object
- `missionResult`: object

#### Example
```json
{
  "gameRoomId": "room-001",
  "gameState": {
    "status": "FINISHED"
  },
  "missionResult": {
    "missionId": "mission-001",
    "isMissionCleared": false,
    "judgeStatus": "FAILED",
    "selectedInputs": [[1, 2, 3, 4, 5, 6]],
    "expectedOutputs": [[2, 4, 6]],
    "actualOutputs": [[1, 2, 3, 4, 5, 6]],
    "strikeCount": 1,
    "remainingStrikeCount": 2,
    "feedbackMessage": "짝수만 반환해야 하지만 전체 리스트가 반환되었습니다.",
    "detectedIssues": [
      {
        "issueType": "LOGIC_ERROR",
        "message": "짝수 조건이 적용되지 않았습니다.",
        "filePath": "main.py",
        "lineNumber": 3
      }
    ]
  }
}
```

#### Frontend Handling
- 최종 미션 성공 또는 실패 결과를 표시한다.
- 게임 종료/결과 화면으로 이동한다.
- 실패 시 최종 남은 목숨과 누적 판정 결과를 표시한다.
- `detectedIssues`가 있으면 최종 실패 원인으로 표시한다.
- 이 이벤트는 개별 턴 판정이 아니라 게임 종료 시점의 최종 미션 판정이다.

### Frontend Handling Summary
1. `join-room` 전송 후 초기 실시간 동기화를 시작한다.
2. `room-participants-updated`로 대기방 상태를 갱신한다.
3. `game-started` 수신 시 게임 화면으로 전환한다.
4. `code-change` / `code-updated`로 협업 편집 상태를 동기화한다.
5. `turn-evaluated`와 `turn-changed`를 순서대로 반영해 턴 진행을 제어한다.
6. `game-state-updated`, `mission-result`로 종료 상태와 결과 화면을 구성한다.

---

## 13. Main Flow Summary

1. 로그인 후 `GET /game-rooms`, `GET /game-room-participants`, `GET /ai-chat-sessions`로 메인 화면 초기 상태를 구성한다.
2. 방이 없으면 `POST /ai-chat-sessions/{aiChatSessionId}/messages`로 AI 채팅 기반 방 생성 플로우를 시작한다.
3. 초대가 있으면 `GET /game-room-participants?status=INVITED` 결과를 기반으로 수락/거절 UX를 제공한다.
4. 게임 시작은 AI 채팅의 `GAME_START` 응답 또는 직접 `POST /game-rooms/{gameRoomId}/start`로 연결한다.
5. 게임 시작 이후 상태 동기화는 WebSocket 이벤트를 기준으로 처리한다.
