# Domain Model

## Core Entities

## Terminology Clarifications

- **Mission Template**: A reusable mission definition chosen before a game starts. It defines the intended challenge, initial project structure, machine-readable judge policy, and the ordered steps that later become a live room mission.
- **Room Mission**: The live mission instance created for exactly one game room from one mission template. It carries room-specific progress state such as current step, strike count, and final outcome.
- **Room Settings**: The per-room gameplay configuration chosen for one game session, including participant bounds, turn time limit, and strike limit. It belongs to the game room, not to the mission template.
- **Strike Count**: The accumulated number of failed step judgments within one room mission. It increases on failure and the room mission fails when it reaches the configured maximum.
- **Docker Image**: The reusable runtime image definition referenced by one or more mission templates. It identifies the execution environment independently from any one room mission.
- **Judge Policy**: The machine-readable judgment contract attached to a mission template. It defines how submitted code is executed and how the current step is evaluated from the execution result.

### User

Represents a system user. Owns signup, login, room creation, participation, turn execution, and AI chat session initiation.

On successful signup, the server creates exactly one reusable AI chat session for the user in MVP.

Key relations:

- `refresh_tokens` (1:N)
- `game_rooms.owner_user_id`
- `game_room_participants.user_id`
- `turns.player_user_id`
- `executions.user_id`
- `ai_chat_sessions.requester_user_id`

### RefreshToken

Stores login-session continuation state. The raw refresh token must not be stored; only a hash is persisted.

### GameRoom

The top-level container of one game session. It owns the room settings for that session: owner, difficulty, time limit, strike limit, and participant count bounds.

Status set:

- `WAITING`
- `IN_PROGRESS`
- `JUDGING`
- `ANALYZED`
- `FINISHED`

Recommended transition:

`WAITING -> IN_PROGRESS -> JUDGING/ANALYZED -> FINISHED`

MVP runtime path:

`WAITING -> IN_PROGRESS -> FINISHED`

### GameRoomParticipant

Represents one user's membership in one room.

Roles:

- `OWNER`
- `PARTICIPANT`

Membership statuses:

- `INVITED`
- `JOINED`
- `LEFT`
- `DENIED`

State owners:

- owner invitation creates `INVITED`
- invite acceptance changes to `JOINED`
- invite denial changes to `DENIED`
- leave or cleanup changes to `LEFT`

### MissionTemplate

The reusable mission definition chosen before the game starts. It defines the challenge itself, while room settings such as participant bounds and turn time limit remain properties of the game room.

Important fields:

- `judge_policy_json`
- `project_structure_json`
- `docker_image_id`

### MissionTemplateStep

Defines an ordered step within a mission template, including target file, success criteria, and hint text. These ordered steps later become room-specific step-progress records inside one room mission.

### GameRoomMission

Represents the live mission instance inside one room. It is created from exactly one mission template and tracks the selected template, current step, runtime container, strike count, and lifecycle timestamps.

### GameRoomMissionStep

Represents step-progress state inside a room mission.

Statuses:

- `LOCKED`
- `READY`
- `IN_PROGRESS`
- `CLEARED`
- `FAILED`

### Turn

Represents the time slice during which one player owns editing authority.

Confirmed statuses:

- `IN_PROGRESS`
- `SUBMITTED`
- `TIMEOUT`

`EXPIRED` and `COMPLETED` are not valid.

### TurnSnapshot

The persistent code snapshot saved at turn end. The system does not persist every realtime edit.

### Execution

Stores a code execution request and its result.

Statuses:

- `PENDING`
- `RUNNING`
- `SUCCESS`
- `FAILED`
- `TIMEOUT`

### MissionResult

Stores judgment output for a turn or final mission completion.

Judge statuses:

- `PASSED`
- `FAILED`
- `ERROR`

### AI Chat Domain

- `AiChatSession`: a user-facing AI chat session
- `AiChatRequest`: one command-interpretation request derived from a user message
- `AiChatMessage`: user, assistant, or system chat log

This domain handles room creation, invitation, join, denial, and start-preparation commands.

MVP rule:

- each user has exactly one AI chat session
- mission template selection returns through a natural-language user message, not a dedicated client action field

### AI Gameplay Domain

- `AiGameSession`: AI session bound to a game room
- `AiGameRequest`: debugging or judgment-assistance request
- `AiRealtimeEvent`: emitted AI-driven realtime message such as hints or feedback

This domain provides assistive information only. It does not own authoritative state.

### Docker Image Domain

- `DockerImage`: execution image metadata
- `DockerImageDeployment`: deployment history of runtime images

The mission template references one `DockerImage`, while the room mission later holds the live runtime container identifier derived from that image.

## Domain Invariants

- Only the server may apply authoritative room, turn, mission, and result transitions.
- Only the current turn player may submit a turn.
- Realtime code sync is ephemeral; only snapshots are durable.
- AI may interpret, explain, and assist, but it may not decide final state.
- Room membership and room ownership must be checked in service-layer authorization.
- One user may not belong to more than one `WAITING` room at the same time.
- Runtime execution only executes submitted code; the server reads the judge policy and decides pass or fail for the current step.
