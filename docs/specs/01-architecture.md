# Runtime Architecture

## System Shape

The MVP is designed as a single NestJS backend application that exposes both HTTP APIs and a WebSocket gateway.

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
 ├─ Redis / MQ (optional extension point)
 ├─ LLM Integration
 └─ Docker / Container Runtime Integration
```

## Synchronous vs Asynchronous Boundaries

Synchronous workloads:

- authentication
- main-entry query APIs
- AI chat message intake and immediate response
- game start request
- hint retrieval

Asynchronous or async-like workloads:

- code execution and result collection
- AI judgment assistance and feedback generation
- WebSocket fan-out
- realtime session support state

## Infrastructure Assumptions

### PostgreSQL

Stores users, rooms, participants, missions, turns, execution results, and AI session history.

MVP auth and AI-chat migrations assume the `pgcrypto` extension is available so `gen_random_uuid()` can be used for UUID primary keys.

### Redis

Used as a support layer for:

- WebSocket session state
- current gameplay cache
- broadcast fan-out support
- optional distributed locks or timer support

### MQ

Reserved as an extension point when execution or AI judgment work must be split into separate consumers. It is not required for MVP.

### LLM

Used for:

- AI chat intent parsing
- mission feedback and debugging summaries
- judgment-assistance explanations

### Docker or External Runtime

Used for:

- runtime environment preparation at mission start
- submitted code execution
- stdout, stderr, and exit-code return

## Architecture Constraints

- HTTP API and WebSocket gateway run within one server boundary.
- Authoritative state changes are allowed only in the service layer.
- Realtime code edits are non-persistent collaboration state; only turn-end snapshots are durable.
- Docker, LLM, Redis, and similar systems must be hidden behind `integrations/`.
- MVP prioritizes correctness of state transition and recovery over multi-instance scalability.

## Runtime Boundary Rules

- Controllers and gateways orchestrate only.
- Domain services do not call vendor SDKs directly.
- External systems are adapted behind integration modules.
- Persistent data and ephemeral collaborative state are intentionally separated.
