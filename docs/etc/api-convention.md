# REST API Convention (v1.2)

## 1. 목적 (Purpose)

이 문서는 다음을 보장한다:

* 팀 내 API 설계/구현의 일관성
* 클라이언트 및 서버 간 예측 가능한 인터페이스 제공
* 사람이 아닌 AI도 규칙을 명확히 해석 가능하도록 정의

---

## 2. 기본 원칙 (Principles)

1. RESTful 설계를 따른다
2. 리소스 중심(Resource-Oriented)으로 URL을 설계한다
3. HTTP Method는 의미에 맞게 정확히 사용한다
4. 모든 규칙은 예외 없이 적용한다

---

## 3. URL 설계 규칙

### 3.1 기본 구조

```
/{version}/{resource}/{resource_id}/{sub_resource}
```

예시:

```
/v1/users
/v1/users/{userId}
/v1/users/{userId}/orders
```

---

### 3.2 명명 규칙

| 항목   | 규칙                               |
| ---- | -------------------------------- |
| 리소스명 | 복수형 사용 (users, orders)           |
| 케이스  | kebab-case                       |
| 금지   | 동사 사용 금지 (단, action endpoint 제외) |

---

### 3.3 Action Endpoint 규칙 (POST 전용)

행위 요청 API는 다음 규칙을 따른다:

```
/{resource}/{resource_id}/{action}
```

* 마지막 path에 동사를 사용한다
* 반드시 POST 사용

예시:

```
POST /v1/messages/{messageId}/send
POST /v1/reservations/{reservationId}/confirm
POST /v1/payments/{paymentId}/cancel
```

---

## 4. HTTP Method 규칙

| Method | 의미          | 특징             |
| ------ | ----------- | -------------- |
| GET    | 조회          | Idempotent     |
| POST   | 생성 / 행위 요청  | Non-idempotent |
| PUT    | 전체 또는 부분 수정 | Idempotent     |
| DELETE | 삭제          | Idempotent     |

---

### 4.1 상세 규칙

#### GET

* 서버 상태 변경 금지

#### POST

* 리소스 생성
* 행위 요청 (send, reserve, cancel 등)

#### PUT

* 전체 또는 부분 수정 모두 허용
* 멱등성 보장 필수

#### DELETE

* 리소스 삭제

---

## 5. Request 규칙

### 5.1 Header

```
Content-Type: application/json
Authorization: Bearer {token}
```

---

### 5.2 Body 규칙

* JSON 사용
* camelCase 사용

예시:

```json
{
  "userName": "john",
  "email": "john@example.com"
}
```

---

### 5.3 Query Parameter

```
GET /v1/users?page=1&size=20&sort=createdAt,desc
```

---

## 6. Response 규칙

### 6.1 공통 구조

```json
{
  "data": {},
  "meta": {},
  "error": null
}
```

---

### 6.2 네이밍 규칙

* camelCase 사용

예시:

```json
{
  "userId": 1,
  "userName": "john"
}
```

---

### 6.3 Response Schema 타입 규칙

Response의 `data` 필드는 API별로 명확한 타입을 가져야 한다.

| 응답 유형      | data 타입 | 예시                                      |
| ---------- | ------- | --------------------------------------- |
| 단일 리소스 조회  | object  | `{ "userId": 1, "userName": "john" }`   |
| 리스트 조회     | array   | `[{ "userId": 1, "userName": "john" }]` |
| 생성 / 수정 결과 | object  | `{ "userId": 1 }`                       |
| 삭제 성공      | 없음      | HTTP 204 사용, body 없음                    |
| 실패 응답      | null    | `data: null`                            |

규칙:

* `data`는 성공 응답에서 object 또는 array로 명확히 정의한다.
* 각 API 명세는 `data`의 타입과 필드 구조를 반드시 포함한다.
* 리스트 조회 결과가 없으면 `null`이 아니라 빈 배열 `[]`을 반환한다.
* 단일 리소스 조회 결과가 없으면 빈 객체 `{}`가 아니라 `404 Not Found`를 반환한다.
* 실패 응답에서는 `data`를 `null`로 반환한다.

---

### 6.4 성공 응답

```json
{
  "data": {
    "userId": 1,
    "userName": "john"
  },
  "meta": {
    "requestId": "uuid"
  },
  "error": null
}
```

---

### 6.5 실패 응답

```json
{
  "data": null,
  "meta": {
    "requestId": "uuid"
  },
  "error": {
    "code": "USER_NOT_FOUND",
    "message": "User not found"
  }
}
```

---

## 7. HTTP Status Code 규칙

| 코드  | 의미     |
| --- | ------ |
| 200 | 성공     |
| 201 | 생성 성공  |
| 204 | 삭제 성공  |
| 400 | 잘못된 요청 |
| 401 | 인증 실패  |
| 403 | 권한 없음  |
| 404 | 리소스 없음 |
| 409 | 충돌     |
| 500 | 서버 오류  |

---

## 8. Pagination 규칙

### 요청

```
GET /v1/users?page=1&size=20&sort=createdAt&order=desc
```

### 규칙

* sort: 정렬 기준 필드
* order: asc | desc
* 기본값: desc

---

### 응답

```json
"meta": {
  "page": 1,
  "size": 20,
  "total": 100
}
```

---

## 9. Versioning 규칙

```
/v1/users
/v2/users
```

---

## 10. Idempotency 규칙

* PUT / DELETE → 반드시 멱등성 보장
* POST → 멱등성 보장하지 않음

---

## 11. 금지 사항 (Strict Rules)

❌ URL에 동사 사용 금지 (단, action endpoint 제외) ❌ 응답 구조 임의 변경 금지 ❌ HTTP Method 의미 위반 금지 ❌ 상태코드와 body 불일치 금지

---

## 12. AI 해석 가능 규칙

```
RULE-001: All resource names MUST be plural
RULE-002: Request fields MUST use camelCase
RULE-003: Response fields MUST use camelCase
RULE-004: POST MAY be used for actions with verb in path
RULE-005: PUT MUST be idempotent
RULE-006: Response MUST include data/meta/error
RULE-007: Error MUST include code and message
RULE-008: Default sort order MUST be desc
RULE-009: Version MUST be included in URL path
RULE-010: data MUST be object or array explicitly defined per API
RULE-011: meta MUST include requestId always
RULE-012: Database fields MAY use snake_case but MUST be mapped to camelCase in API
```

---

## 13. 예시

### 요청

```
POST /v1/messages/123/send
```

```json
{
  "content": "hello"
}
```

---

### 응답

```json
{
  "data": {
    "messageId": 123,
    "status": "sent"
  },
  "meta": {
    "requestId": "abc-123"
  },
  "error": null
}
```


# REST API Convention (v1.2)

## 1. Purpose

This document ensures the following:

* Consistency in API design and implementation across the team
* Predictable interfaces between client and server
* Clearly defined rules that can be interpreted unambiguously by AI as well as humans

---

## 2. Principles

1. Follow RESTful design
2. Design URLs in a resource-oriented manner
3. Use HTTP methods accurately according to their semantics
4. Apply all rules without exception

---

## 3. URL Design Rules

### 3.1 Basic Structure

```
/{version}/{resource}/{resource_id}/{sub_resource}
```

Examples:

```
/v1/users
/v1/users/{userId}
/v1/users/{userId}/orders
```

---

### 3.2 Naming Rules

| Item | Rule |
| ---- | ---- |
| Resource name | Use plural nouns (users, orders) |
| Case | kebab-case |
| Prohibited | Do not use verbs (except for action endpoints) |

---

### 3.3 Action Endpoint Rules (POST only)

Action request APIs must follow this rule:

```
/{resource}/{resource_id}/{action}
```

* Use a verb in the final path segment
* Must use POST

Examples:

```
POST /v1/messages/{messageId}/send
POST /v1/reservations/{reservationId}/confirm
POST /v1/payments/{paymentId}/cancel
```

---

## 4. HTTP Method Rules

| Method | Meaning | Characteristic |
| ------ | ------- | -------------- |
| GET    | Retrieve | Idempotent |
| POST   | Create / Action request | Non-idempotent |
| PUT    | Full or partial update | Idempotent |
| DELETE | Delete | Idempotent |

---

### 4.1 Detailed Rules

#### GET

* Must not change server state

#### POST

* Create resources
* Request actions (send, reserve, cancel, etc.)

#### PUT

* Both full and partial updates are allowed
* Idempotency must be guaranteed

#### DELETE

* Delete resources

---

## 5. Request Rules

### 5.1 Headers

```
Content-Type: application/json
Authorization: Bearer {token}
```

---

### 5.2 Body Rules

* Use JSON
* Use camelCase

Example:

```json
{
  "userName": "john",
  "email": "john@example.com"
}
```

---

### 5.3 Query Parameters

```
GET /v1/users?page=1&size=20&sort=createdAt,desc
```

---

## 6. Response Rules

### 6.1 Common Structure

```json
{
  "data": {},
  "meta": {},
  "error": null
}
```

---

### 6.2 Naming Rules

* Use camelCase

Example:

```json
{
  "userId": 1,
  "userName": "john"
}
```

---

### 6.3 Response Schema Type Rules

The `data` field in responses must have a clearly defined type per API.

| Response Type | data Type | Example |
| ------------ | --------- | ------- |
| Single resource retrieval | object | `{ "userId": 1, "userName": "john" }` |
| List retrieval | array | `[{ "userId": 1, "userName": "john" }]` |
| Create / update result | object | `{ "userId": 1 }` |
| Delete success | none | Use HTTP 204, no body |
| Failure response | null | `data: null` |

Rules:

* In successful responses, `data` must be explicitly defined as either object or array.
* Each API specification must include the type and field structure of `data`.
* If a list retrieval has no results, return an empty array `[]`, not `null`.
* If a single resource retrieval has no result, return `404 Not Found`, not an empty object `{}`.
* In failure responses, return `data` as `null`.

---

### 6.4 Success Response

```json
{
  "data": {
    "userId": 1,
    "userName": "john"
  },
  "meta": {
    "requestId": "uuid"
  },
  "error": null
}
```

---

### 6.5 Failure Response

```json
{
  "data": null,
  "meta": {
    "requestId": "uuid"
  },
  "error": {
    "code": "USER_NOT_FOUND",
    "message": "User not found"
  }
}
```

---

## 7. HTTP Status Code Rules

| Code | Meaning |
| ---- | ------- |
| 200 | Success |
| 201 | Created |
| 204 | Deleted successfully |
| 400 | Bad request |
| 401 | Authentication failed |
| 403 | Forbidden |
| 404 | Resource not found |
| 409 | Conflict |
| 500 | Server error |

---

## 8. Pagination Rules

### Request

```
GET /v1/users?page=1&size=20&sort=createdAt&order=desc
```

### Rules

* sort: field used for sorting
* order: asc | desc
* default: desc

---

### Response

```json
"meta": {
  "page": 1,
  "size": 20,
  "total": 100
}
```

---

## 9. Versioning Rules

```
/v1/users
/v2/users
```

---

## 10. Idempotency Rules

* PUT / DELETE → Idempotency must be guaranteed
* POST → Idempotency is not guaranteed

---

## 11. Prohibited Items (Strict Rules)

❌ Verbs in URL paths are prohibited (except action endpoints)  
❌ Arbitrary changes to the response structure are prohibited  
❌ Violating HTTP method semantics is prohibited  
❌ Mismatch between status code and body is prohibited

---

## 12. AI-Interpretable Rules

```
RULE-001: All resource names MUST be plural
RULE-002: Request fields MUST use camelCase
RULE-003: Response fields MUST use camelCase
RULE-004: POST MAY be used for actions with verb in path
RULE-005: PUT MUST be idempotent
RULE-006: Response MUST include data/meta/error
RULE-007: Error MUST include code and message
RULE-008: Default sort order MUST be desc
RULE-009: Version MUST be included in URL path
RULE-010: data MUST be object or array explicitly defined per API
RULE-011: meta MUST include requestId always
RULE-012: Database fields MAY use snake_case but MUST be mapped to camelCase in API
```

---

## 13. Example

### Request

```
POST /v1/messages/123/send
```

```json
{
  "content": "hello"
}
```

---

### Response

```json
{
  "data": {
    "messageId": 123,
    "status": "sent"
  },
  "meta": {
    "requestId": "abc-123"
  },
  "error": null
}
```
