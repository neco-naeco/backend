```sql
src/
├── main.ts
├── app.module.ts
├── common/
│   ├── config/
│   ├── constants/
│   ├── decorators/
│   ├── exceptions/
│   ├── filters/
│   ├── guards/
│   ├── interceptors/
│   ├── middleware/
│   ├── pipes/
│   ├── types/
│   └── utils/
├── database/
│   ├── migrations/
│   ├── seeds/
│   └── database.module.ts
├── integrations/
│   ├── jwt/
│   ├── redis/
│   ├── mq/
│   ├── websocket/
│   └── llm/
├── shared/
│   ├── dto/
│   ├── enums/
│   ├── interfaces/
│   └── mapper/
└── modules/
    └── {module-name}/
        ├── controller/
        │   ├── dto/
        │   │   ├── request/
        │   │   └── response/
        │   └── {module-name}.controller.ts
        ├── service/
        │   ├── dto/
        │   ├── interfaces/
        │   ├── mapper/
        │   ├── {module-name}.service.ts
        │   └── {module-name}.service.spec.ts
        ├── entity/
        │   ├── {module-name}.entity.ts
        │   └── repository/
        │       ├── {module-name}.repository.ts
        │       └── {module-name}.repository.interface.ts
        ├── gateway/  // 실시간 서버 등 필요 시만 추가
        └── {module-name}.module.ts
```

---

# 최종 폴더 구조별 책임 정의

## 1. Root Layer

### `main.ts`

- 애플리케이션 진입점
- NestJS 앱 생성 및 글로벌 설정 적용 (middleware, pipe, filter 등)

### `app.module.ts`

- 루트 모듈
- 전체 모듈 조합 및 의존성 연결

---

## 2. Common Layer (전역 공통 기능)

```
common/
```

**목적:**

모든 모듈에서 재사용되는 **프레임워크 레벨 공통 기능 제공**

### 주요 폴더

- `config/`
    - 환경 변수 및 설정 관리
    - (ex: database config, redis config)
- `constants/`
    - 하드코딩 방지용 상수 정의
    - (ex: role enum, error code)
- `decorators/`
    - 커스텀 데코레이터 정의
    - (ex: @User(), @Auth())
- `exceptions/`
    - 커스텀 예외 클래스 정의
    - 도메인/비즈니스 에러 분리
- `filters/`
    - NestJS Exception Filter
    - 글로벌 에러 응답 포맷 통일
- `guards/`
    - 인증/인가 처리
    - (ex: JWT Guard, Role Guard)
- `interceptors/`
    - 요청/응답 가로채기
    - (logging, response wrapping 등)
- `middleware/`
    - 요청 전처리
    - (ex: logging, request id)
- `pipes/`
    - DTO validation 및 transform
    - (class-validator, class-transformer)
- `types/`
    - 공통 타입 정의
    - (ex: Pagination, ApiResponse)
- `utils/`
    - 순수 유틸 함수
    - 비즈니스 로직 금지

---

## 3. Database Layer

```
database/
```

**목적:**

DB 연결 및 인프라 설정 담당 (비즈니스 로직 없음)

- `migrations/`
    - DB 스키마 변경 이력
- `seeds/`
    - 초기 데이터 삽입 스크립트
- `database.module.ts`
    - ORM(TypeORM 등) 설정
    - DB 커넥션 생성

---

## 4. Integrations Layer (외부 시스템 연동)

```
integrations/
```

**목적:**

외부 서비스와의 연결을 **추상화하여 내부 로직과 분리**

### 예시

- `jwt/`
    - 토큰 생성/검증 로직
- `redis/`
    - 캐시 및 pub/sub
- `mq/`
    - 메시지 큐 (RabbitMQ, Kafka 등)
- `websocket/`
    - 소켓 연결 관리
- `llm/`
    - LLM API 호출 (OpenAI 등)

👉 핵심 원칙:

- service는 직접 외부 라이브러리 호출하지 않음
- 반드시 integrations를 통해 호출

---

## 5. Shared Layer (도메인 간 공유 영역)

```
shared/
```

**목적:**

여러 모듈에서 공통으로 사용하는 **도메인 수준 구성요소**

- `dto/`
    - 공통 DTO (pagination, common response 등)
- `enums/`
    - 공통 enum
- `interfaces/`
    - 공통 인터페이스
- `mapper/`
    - 공통 변환 로직
    - (ex: pagination mapper)

👉 common과의 차이:

- common = 기술/프레임워크 공통
- shared = 도메인/비즈니스 공통

---

## 6. Modules Layer (핵심 도메인 계층)

```
modules/
```

**목적:**

각 도메인의 **완전한 독립 단위 (feature-based modularization)**

---

# 모듈 내부 구조 책임

```
modules/{module-name}/
```

---

## 6.1 controller/

```
controller/
```

**역할: Presentation Layer**

- HTTP / WebSocket 요청 처리
- Request DTO 검증
- Response DTO 반환

### 하위 구조

- `dto/request/`
    - 클라이언트 입력 모델
    - validation 포함
- `dto/response/`
    - API 응답 모델
    - Entity 직접 반환 금지
- `{module}.controller.ts`
    - 라우팅 정의
    - service 호출만 수행 (비즈니스 로직 금지)

---

## 6.2 service/

```
service/
```

**역할: Application Layer (핵심)**

- 비즈니스 로직 처리
- 유스케이스 구현
- 트랜잭션 관리
- repository 호출
- DTO ↔ Entity 변환 orchestration

### 하위 구조

- `dto/`
    - service 내부에서 사용하는 데이터 구조
    - (controller DTO와 분리 가능)
- `interfaces/`
    - 외부 의존성 추상화
    - (ex: repository interface, external client interface)
- `mapper/`
    - Entity ↔ DTO 변환
    - API와 DB 완전 분리 핵심
- `{module}.service.ts`
    - 유스케이스 구현

👉 핵심 규칙:

- controller는 entity를 모름
- entity → 반드시 mapper 통해 변환

---

## 6.3 entity/

```
entity/
```

**역할: Persistence Layer**

- DB 모델 정의
- ORM entity
- repository 구현

### 하위 구조

- `{module}.entity.ts`
    - 테이블 구조 정의
- `repository/`
    - DB 접근 로직
    - `{module}.repository.interface.ts`
        - repository 추상화 (DI 목적)
    - `{module}.repository.ts`
        - 실제 구현 (TypeORM 등)

👉 핵심 규칙:

- service는 interface만 의존
- 구현은 교체 가능 (DB 변경 대응)

---

## 6.4 gateway/ (선택)

```
gateway/
```

**역할: Realtime Layer**

- WebSocket 이벤트 처리
- 실시간 통신 진입점

👉 특징:

- controller와 유사하지만 HTTP 대신 socket 처리
- service 호출만 수행

---

## 6.5 module.ts

```
{module}.module.ts
```

**역할: DI 조립**

- controller 등록
- service 등록
- repository 연결
- provider binding

---

# 핵심 설계 요약

## 1. 계층 구조

```
Controller → Service → Repository → Entity
```

---

## 2. 절대 금지 사항

- Controller → Entity 직접 접근 ❌
- Entity → Response 그대로 반환 ❌
- Service → 외부 API 직접 호출 ❌

---

## 3. 반드시 지켜야 할 구조

- API DTO ≠ Entity
- Mapper로 변환
- Repository Interface 사용

---