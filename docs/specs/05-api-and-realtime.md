# API and Realtime Contract

## General API Rules

- Base URL: `/v1`
- resource names: plural
- path style: `kebab-case`
- request and response fields: `camelCase`
- response wrapper: always `data`, `meta`, `error`

## Authentication

All APIs require authentication except:

- `GET /v1/auth/check-nickname`
- `POST /v1/auth/signup`
- `POST /v1/auth/login`
- `POST /v1/auth/refresh-token`

Auth request field rules:

- `POST /v1/auth/signup` accepts `passwordHash` as a SHA-256 hex string.
- `POST /v1/auth/login` accepts `passwordHash` as a SHA-256 hex string.
- `POST /v1/auth/refresh-token` returns both a new `accessToken` and a new `refreshToken`.
- On successful signup, the server automatically creates one initial `ACTIVE` AI chat session for that user.

Authorization header:

`Bearer {accessToken}`

## Response Wrapper

Success:

```json
{
  "data": {},
  "meta": {
    "requestId": "uuid"
  },
  "error": null
}
```

Error:

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

## Timestamp Policy

- All timestamps are serialized as ISO 8601 strings in `Asia/Seoul` timezone.
- The client is not expected to convert to another timezone for MVP.

## Pagination Policy

- MVP does not support pagination.
- List endpoints return the full list.
- `meta` contains `requestId` only.

## Important Domain Constants

### Room and Turn

- `GameRoomStatus`: `WAITING`, `IN_PROGRESS`, `JUDGING`, `ANALYZED`, `FINISHED`
- `TurnStatus`: `IN_PROGRESS`, `SUBMITTED`, `TIMEOUT`
- `GameRoomParticipantMembershipStatus`: `INVITED`, `JOINED`, `LEFT`, `DENIED`
- `GameRoomParticipantRole`: `OWNER`, `PARTICIPANT`
- `GameRoomMissionStepStatus`: `LOCKED`, `READY`, `IN_PROGRESS`, `CLEARED`, `FAILED`

### Execution and AI

- `ExecutionStatus`: `PENDING`, `RUNNING`, `SUCCESS`, `FAILED`, `TIMEOUT`
- `AiChatRequestType`: `ROOM_CREATE`, `USER_INVITE`, `ROOM_JOIN`, `USER_INVITE_DENY`, `GAME_START`
- `AiChatRequestStatus`: `RECEIVED`, `COMPLETED`, `FAILED`
- `AiChatMessageSenderType`: `USER`, `ASSISTANT`, `SYSTEM`
- `AiChatMessageType`: `TEXT`, `COMMAND_RESULT`, `SYSTEM_NOTICE`
- `AiRealtimeEventType`: `SYSTEM_NOTIFICATION`, `MISSION_FEEDBACK`, `MISSION_RESULT`

## Key Endpoint Categories

### Auth

- nickname duplication check
- signup
- login
- token refresh

### Main Entry

- `GET /v1/ai-chat-sessions`
- `GET /v1/game-rooms`
- `GET /v1/game-room-participants`

Main entry contract notes:

- `GET /v1/ai-chat-sessions` returns the user's AI chat session list in MVP and must guarantee at least one `ACTIVE` session for main-entry use.
- `GET /v1/game-rooms` may return multiple rooms across statuses, but the server must guarantee at most one `WAITING` room per user.
- If multiple `WAITING` rooms are returned for one user, the client should treat that as an abnormal state.

### AI Chat

- `GET /v1/ai-chat-sessions/{aiChatSessionId}/messages`
- `POST /v1/ai-chat-sessions/{aiChatSessionId}/messages`

`POST /v1/ai-chat-sessions/{aiChatSessionId}/messages` response rules:

- `requestType` uses the canonical five command values only when intent parsing has finished.
- When `requestStatus` is `RECEIVED`, `requestType` must be omitted from the success payload.
- When `requestStatus` is `COMPLETED` or `FAILED`, `requestType` is required.
- Until intent parsing is implemented, the server may persist an internal unparsed marker in storage, but that value must not appear in API responses.

### Game Start

- `POST /v1/game-rooms/{gameRoomId}/start`

### Hint

- `GET /v1/game-room-missions/{missionId}/hints?scope=current-step`

## API Design Rules

- Action endpoints are allowed for room creation, invitation, and similar behaviors when the target resource remains explicit.
- Return `404` for missing single resources.
- Return `[]` for empty lists.
- Never expose raw database `snake_case` fields directly.
- After the game starts, the frontend should treat WebSocket events as the primary state-update channel.

## WebSocket Events

Event names are fixed:

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
- `game-item-use`
- `game-item-used`
- `game-item-error`

Payload shape must follow the API spec as the external contract.

Payload-specific contract notes:

- `game-started` must include gameplay-entry state for the initial editor.
- `game-started.missionState` must include:
  - `title: string`
  - `description: string`
  - `language: string`
  - `difficulty: string`
- `game-started.missionState.projectStructure.files[*]` must include:
  - `filePath: string`
  - `language: string`
  - `readonly: boolean`
  - `fileUrl: string`
- `fileUrl` is a presigned or public URL that the client fetches to load the initial file content.
- `room-participants-updated` must always include:
  - `participants: array`
  - `changedParticipant: object | null`
- `changedParticipant` may be `null` only when the broadcast represents a full-state refresh without one specific participant transition to highlight.
- `code-change` uses whole-file synchronization payloads with `content: string`, not `codeDelta`.
- `code-updated` uses whole-file synchronization payloads with `content: string`, not `codeDelta`.
- `turn-submit` uses `{ gameRoomId, userId, turnId, codeSnapshot, submittedAt }` as the external client payload.
- `turn-changed` must include a full `turnState` payload for the next active turn.
- `turn-evaluated.evaluationResult` must include:
  - `feedbackMessage: string`
  - `detectedIssues: array`
  - `strikeCount: number`
  - `remainingStrikeCount: number`
  - `executionSummary: object`

Canonical event payload summaries:

### `room-participants-updated` (Server -> Client)

- `gameRoomId: string`
- `participants: array`
- `changedParticipant: object | null`
- `gameState: object`
- `missionState: object | null`
- `occurredAt: string`

### `game-started` (Server -> Client)

- `gameRoomId: string`
- `gameState: object`
- `missionState: object`
  - `title: string`
  - `description: string`
  - `language: string`
  - `difficulty: string`
  - `projectStructure.files[*]`
- `uiHints: object`
- `occurredAt: string`

### `code-change` (Client -> Server)

- `gameRoomId: string`
- `userId: string`
- `sessionId: string`
- `filePath: string`
- `content: string`
- `occurredAt: string`

### `code-updated` (Server -> Client)

- `gameRoomId: string`
- `userId: string`
- `filePath: string`
- `content: string`
- `occurredAt: string`

Optional field:

- `sessionId?: string`
  - allowed only when the frontend contract needs echo suppression

### `turn-submit` (Client -> Server)

- `gameRoomId: string`
- `userId: string`
- `turnId: string`
- `codeSnapshot: object`
  - `files[*].filePath: string`
  - `files[*].content: string`
- `submittedAt: string`

### `turn-evaluated` (Server -> Client)

- `gameRoomId: string`
- `evaluatedTurn: object`
- `evaluationResult: object`
  - `feedbackMessage: string`
  - `detectedIssues[*].issueType: string`
  - `detectedIssues[*].message: string`
  - `detectedIssues[*].filePath: string`
  - `detectedIssues[*].lineNumber?: number`
  - `strikeCount: number`
  - `remainingStrikeCount: number`
  - `executionSummary: object`
- `occurredAt: string`

### `turn-changed` (Server -> Client)

- `gameRoomId: string`
- `missionState: object`
- `turnState: object`
  - `turnId: string`
  - `turnNumber: number`
  - `currentPlayerId: string`
  - `startedAt: string`
  - `deadlineAt: string`
  - `timeLimitSeconds: number`
  - `remainingTimeSeconds: number`
  - `status: string`
- `nextPlayerId: string`
- `turnSnapshotId: string`
- `occurredAt: string`

## WebSocket Close Codes

| Code | Reason |
|---|---|
| `4401` | `AUTH_TOKEN_INVALID` |
| `4403` | `FORBIDDEN_RESOURCE_ACCESS` |
| `4404` | `GAME_ROOM_NOT_FOUND` |
| `1000` | normal closure |

Seamless gameplay reconnection is not supported by the existing membership lifecycle. A broken connection transitions the participant to `LEFT`. The Game Item MVP Contract below defines durable inventory and authorized state resynchronization; it does not override membership or room termination rules.

## Game Item MVP Contract (TASK 1)

This section defines the target contract for subsequent implementation tasks; it does not indicate that runtime support is already implemented. It applies equally to multiplayer and personal practice. Only `TIME_EXTENSION_30` is in scope; shield and turn-pass effects are deferred.

### Wire types and delivery

All messages use the existing `{ event, data }` WebSocket envelope, without the HTTP response wrapper. Server timestamps use ISO 8601 with the `+09:00` offset, following the timestamp policy.

```ts
type GameItemType = "TIME_EXTENSION_30";

type GameItemUsePayload = {
  gameRoomId: string;
  turnId: string;
  itemType: GameItemType;
};

type GameItemUsedEvent = {
  gameRoomId: string;
  turnId: string;
  itemType: GameItemType;
  usedBy: { userId: string; nickname: string };
  remainingQuantity: number;
  effect: { addedSeconds: 30; deadlineAt: string };
  occurredAt: string;
};

type GameItemErrorCode =
  | "INVALID_GAME_ITEM_REQUEST"
  | "AUTH_REQUIRED"
  | "FORBIDDEN_RESOURCE_ACCESS"
  | "GAME_ROOM_NOT_FOUND"
  | "GAME_ROOM_NOT_IN_PROGRESS"
  | "TURN_MISMATCH"
  | "TURN_PLAYER_REQUIRED"
  | "TURN_NOT_IN_PROGRESS"
  | "TURN_DEADLINE_EXPIRED"
  | "GAME_ITEM_EXHAUSTED"
  | "GAME_ITEM_INTERNAL_ERROR";

type GameItemErrorEvent = {
  gameRoomId: string | null;
  turnId: string | null;
  itemType: GameItemType | null;
  code: GameItemErrorCode;
  message: string;
  occurredAt: string;
};

type GameItemState = {
  itemType: GameItemType;
  remainingQuantity: number;
};
```

- `game-item-use`: client -> server. Room and turn IDs must be valid UUID strings; `itemType` must exactly match the supported literal.
- `game-item-used`: server -> all currently connected, authorized sockets in the room, including the requester; emitted only after the database transaction commits.
- `game-item-error`: server -> requesting socket only. Do not broadcast errors or expose database/internal exception details.
- Resolve `usedBy` from the authenticated socket session and server user data, never from client-supplied identity.
- The request has no request ID. Allow at most one pending item request per client. Correlate results using `(gameRoomId, turnId, itemType)`; this tuple is not a unique delivery ID and success replay is not guaranteed.
- Error correlation fields contain only syntactically valid supplied values; absent/invalid IDs and unsupported item types are `null`. Null fields do not authorize any room access.

### Validation and errors

Validate request shape first, then authentication and room authorization before revealing room or turn state. For an authorized request, check room status, turn identity/status, actor, deadline, then inventory. When multiple conditions fail, return the first failure in this order.

| Code | Condition |
|---|---|
| `INVALID_GAME_ITEM_REQUEST` | Missing/invalid IDs, malformed payload, or unsupported item type. |
| `AUTH_REQUIRED` | No authenticated session established by `join-room`. |
| `FORBIDDEN_RESOURCE_ACCESS` | Requested room differs from the bound socket room, or the user no longer has active `JOINED` membership. |
| `GAME_ROOM_NOT_FOUND` | Authorized socket's room no longer exists. |
| `GAME_ROOM_NOT_IN_PROGRESS` | Room is not `IN_PROGRESS`. |
| `TURN_MISMATCH` | Turn does not exist, belongs to another room, or an in-progress requested turn is not the room's current turn. |
| `TURN_NOT_IN_PROGRESS` | Requested room turn has already been submitted or timed out. |
| `TURN_PLAYER_REQUIRED` | Authenticated user is not the current turn player. |
| `TURN_DEADLINE_EXPIRED` | Server time is greater than or equal to the stored deadline. |
| `GAME_ITEM_EXHAUSTED` | Inventory row is absent or remaining quantity is zero. |
| `GAME_ITEM_INTERNAL_ERROR` | Unexpected processing failure; outcome may be unknown to the client and requires state resynchronization. |

An item rejection does not itself close the socket. Existing `join-room` authentication/access failures retain their close-code behavior. A failure to deliver an event after commit must not undo inventory, report a definite rollback, or automatically execute the use again.

### Server authority and concurrency

- One item is shared by the whole room for its entire game, not one per participant, turn, or mission step.
- Create the item in the successful game-start transaction. Repeated starts, state reads, new turns, reconnects, and server restarts never refill inventory.
- Lock the turn row, validate current state and deadline, then lock the inventory row. Decrement quantity, increment used count, and add exactly 30 seconds to the stored `deadlineAt` in the same transaction. Roll back all changes on failure.
- Capture server time after acquiring the turn lock; do not use request time, a pre-lock timestamp, or a transaction-start timestamp that predates lock waiting. The eligibility boundary is `serverNow < deadlineAt`.
- Submission and expiration must coordinate on the same turn row lock. Expiration must re-read the deadline under that lock; a stale expiration candidate must not close an extended turn. Disconnect-forced completion remains distinct from deadline expiration.
- The first concurrent use may succeed; later attempts must not consume again or add another 30 seconds. A repeat can return the applicable current-state error, not necessarily `GAME_ITEM_EXHAUSTED`.
- `occurredAt` is the server effect timestamp. `startedAt` and the configured `timeLimitSeconds` do not change; only the authoritative deadline extends.

### State snapshots, recovery, and deployment

- After this feature is implemented, full `gameState` snapshots in `game-started`, `room-participants-updated`, and `game-state-updated` include `items: GameItemState[]` sourced from persisted inventory.
- For MVP, each such snapshot includes exactly one `TIME_EXTENSION_30` entry. Waiting rooms and rooms without an inventory row report `remainingQuantity: 0`; a successful new game reports `1`; a consumed item reports `0`. This normalized view does not create a database row.
- A snapshot must present a consistent committed view of item quantity and the current turn deadline. A finished room still exposes its remaining item quantity but cannot accept item use.
- To recover a missing response while connected, send the existing `join-room` payload on the same socket and wait for `room-participants-updated`. This is a read/resynchronization operation, not another item-use request; it must not repeat membership mutations or reset the game.
- On an authorized new connection, `join-room` returns the same database-backed snapshot. Inventory and deadline survive application-server restart; expiration after restart uses the persisted deadline and current server time, without refunding consumed items.
- Existing disconnect policy marks a participant `LEFT` and may terminate the turn or room. Durable item restoration does not grant re-entry, restore `JOINED`, or resurrect a finished game. Seamless reconnection/grace-period changes are a separate lifecycle feature; rejected joins follow the existing exit/error UX. TASK 7 must verify both authorized restoration and denied re-entry.
- PostgreSQL storage must be persistent to guarantee recovery across database/container restart. Development PostgreSQL now uses a named volume. TASK 10 verified backup/restore preservation and item durability through PostgreSQL container recreation.
- Games already started before the feature deployment receive no retroactive item. Waiting rooms that start after deployment receive one. Missing inventory must never trigger lazy creation during use or recovery.
- During rollout, an absent `items` field means inventory is unknown: disable item use until an authoritative snapshot is available. Do not infer a free item. An omitted field in a partial update preserves known inventory; a room change clears the previous room's inventory.

### Client behavior

- Enable use only when the room/turn is in progress, the local user is the current player, authoritative inventory is positive, the displayed deadline is unexpired, the socket is ready, and neither an item request nor turn submission is pending. The server remains the final authority.
- Do not optimistically change quantity or deadline. Assign the returned `remainingQuantity` and absolute `effect.deadlineAt`; never implement success by adding 30 seconds to the local countdown.
- For the same room, a late success for an old turn can reduce inventory but must not replace the current turn or its deadline. Ignore other-room events. A success cannot change a completed turn back to `IN_PROGRESS`.
- Duplicate events are harmless assignments. Within the same game, quantity never increases after initialization; within the same active turn, an older snapshot must not shorten an already-confirmed extended deadline. Completed state must not be reopened by stale events.
- Show a readable error based on `code`/`message`. Use the correlation tuple to avoid clearing a different pending request.
- If no result arrives within 10 seconds, or the socket disconnects, clear the pending spinner and mark inventory as awaiting synchronization; keep use disabled. Do not assume success or failure and do not automatically resend `game-item-use`.
- Restore known quantity and deadline only from server state. If synchronization also fails, keep use disabled and offer state synchronization retry, not automatic item retry.
- Compute countdown from the server deadline. Mission-guide/start-countdown presentation must not add local bonus time beyond that deadline.

### Contract examples

Request:

```json
{"event":"game-item-use","data":{"gameRoomId":"00000000-0000-4000-8000-000000000001","turnId":"00000000-0000-4000-8000-000000000002","itemType":"TIME_EXTENSION_30"}}
```

Success (the previous deadline was `2026-10-10T12:00:30+09:00`):

```json
{"event":"game-item-used","data":{"gameRoomId":"00000000-0000-4000-8000-000000000001","turnId":"00000000-0000-4000-8000-000000000002","itemType":"TIME_EXTENSION_30","usedBy":{"userId":"00000000-0000-4000-8000-000000000003","nickname":"player1"},"remainingQuantity":0,"effect":{"addedSeconds":30,"deadlineAt":"2026-10-10T12:01:00+09:00"},"occurredAt":"2026-10-10T12:00:20+09:00"}}
```

Rejected repeat while the same turn is still active and unexpired:

```json
{"event":"game-item-error","data":{"gameRoomId":"00000000-0000-4000-8000-000000000001","turnId":"00000000-0000-4000-8000-000000000002","itemType":"TIME_EXTENSION_30","code":"GAME_ITEM_EXHAUSTED","message":"No time extension items remain in this room.","occurredAt":"2026-10-10T12:00:21+09:00"}}
```

Relevant `gameState` fragment in the full `room-participants-updated` snapshot after an authorized rejoin (other existing fields remain unchanged):

```json
{"items":[{"itemType":"TIME_EXTENSION_30","remainingQuantity":0}],"turnState":{"turnId":"00000000-0000-4000-8000-000000000002","turnNumber":1,"currentPlayerId":"00000000-0000-4000-8000-000000000003","startedAt":"2026-10-10T12:00:00+09:00","deadlineAt":"2026-10-10T12:01:00+09:00","timeLimitSeconds":30,"remainingTimeSeconds":35,"status":"IN_PROGRESS"}}
```

The fragment assumes server time `2026-10-10T12:00:25+09:00`. It restores zero inventory and 35 remaining seconds without replaying the item success or granting another item.
