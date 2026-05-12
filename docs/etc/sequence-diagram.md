- 방생성
    
    ```markdown
    sequenceDiagram
        autonumber
        actor Host as "방장"
        participant FE as "Frontend"
        participant AI as "AI 모듈"
        participant LLM as "LLM"
        participant GR as "GameRoom 모듈"
        participant CT as "Container 모듈"
        participant RT as "Realtime 모듈"
    
        Host->>FE: 메인 화면 진입
        FE->>GR: 내 현재 방 소속 여부 조회
        GR->>GR: 참가 중인 방 조회
        GR-->>FE: 소속 없음
    
        Host->>FE: AI 채팅으로 방 생성 요청
        FE->>AI: userMessage 전달
        AI->>LLM: 명령 해석 요청
        LLM-->>AI: ROOM_CREATE intent 반환
    
        AI-->>FE: 난이도 선택 요청 메시지 반환
        FE-->>Host: 난이도 선택 UI 표시
    
        Host->>FE: 난이도 선택
        FE->>AI: 선택된 difficulty 전달
        AI->>GR: 선택된 난이도의 게임 목록 조회 요청
        GR->>GR: 난이도 기준 게임 목록 조회
        GR-->>AI: 게임 목록 반환
        AI-->>FE: 게임 목록 + 선택 요청 메시지 반환
        FE-->>Host: 게임 목록 표시
    
        Host->>FE: 게임 선택 및 방 생성 확정
        FE->>AI: 선택된 missionTemplateId 전달
        AI->>GR: gameRoom 생성 요청
        GR->>GR: gameRoom 생성
        GR->>CT: 실행 환경 준비 요청
        CT->>CT: 선택된 게임 기준 실행 환경 준비
        CT-->>GR: 준비 완료
        GR->>RT: ROOM_CREATED 이벤트 발행
        RT-->>FE: 방 생성 완료 이벤트 전달
        GR-->>AI: 생성된 방 정보 반환
        AI-->>FE: 방 정보 + 다음 액션 메시지 반환
        FE-->>Host: 방 생성 완료 표시
    ```
    
- 방초대(방장)
    
    ```markdown
    ## 2. 방 초대 (방장)
    
    ```mermaid
    sequenceDiagram
        autonumber
        actor Host as "방장"
        participant FE as "Frontend"
        participant AI as "AI 모듈"
        participant LLM as "LLM"
        participant GR as "GameRoom 모듈"
        participant RT as "Realtime 모듈"
    
        Host->>FE: AI 채팅으로 유저 초대 요청
        FE->>AI: userMessage 전달
        AI->>LLM: 명령 해석 요청\n(USER_INVITE intent 추출)
        LLM-->>AI: USER_INVITE + 초대 대상 반환
    
        AI->>GR: 방 초대 요청
        GR->>GR: 초대 대상 처리
        GR->>RT: INVITATION_SENT 이벤트 발행
        RT-->>FE: 초대 결과 및 참가자 상태 갱신 이벤트 전달
        GR-->>AI: 초대 결과 반환
        AI-->>FE: 초대 결과 + 현재 참가 인원 안내 메시지 반환
        FE-->>Host: 초대 완료 표시
    ```
    
    ### 메모
    - 메인 화면의 AI 채팅에서 바로 초대 요청을 보내는 흐름으로 표현했습니다.
    - 큰 흐름 위주로 `초대 요청 -> 초대 대상 해석 -> 초대 처리 -> 실시간 반영`만 표현했습니다.
    - 초대 가능 여부, 중복 초대, 이미 다른 방 소속인 경우 같은 예외는 이후 상세 설계에서 추가하면 됩니다.
    - 현재 방장 기준 흐름만 넣었고, 초대받은 참여자의 수락/거절은 아래 `방 입장`에서 이어집니다.
    - 실제 방 화면 진입은 초대 단계가 아니라, 참여자들이 준비된 뒤 함께 입장하는 별도 흐름으로 보는 것이 맞습니다.
    ```
    
- 참여자
    
    ```markdown
    sequenceDiagram
        autonumber
        actor Guest as "참여자"
        participant FE as "Frontend"
        participant AI as "AI 모듈"
        participant GR as "GameRoom 모듈"
        participant RT as "Realtime 모듈"
    
        Guest->>FE: 메인 화면 진입
        FE->>GR: 내 방 소속 여부 조회
        GR->>GR: 참가 중인 방 조회
        GR-->>FE: 소속 없음
    
        FE->>GR: 내 초대 목록 조회
        GR->>GR: 초대 목록 조회
        GR-->>FE: 초대 정보 반환
        FE->>AI: 초대 브리핑 요청
        AI->>AI: 초대 브리핑 생성
        AI-->>FE: 초대한 유저/방 정보 브리핑 메시지 반환
        FE-->>Guest: 초대 브리핑 표시
    
        Guest->>FE: 초대 수락 클릭
        FE->>GR: 방 입장 요청
        GR->>GR: 방 입장 처리
        GR->>RT: PARTICIPANT_JOINED 이벤트 발행
        RT-->>FE: 참가자 목록 갱신 이벤트 전달
        GR-->>AI: 입장 성공 정보 전달
        AI->>AI: 방 정보/참가 인원 안내 메시지 생성
        AI-->>FE: 방 정보/참가 인원 안내 메시지 반환
        FE-->>Guest: 방 입장 완료 표시
    
        opt 초대 거절
            Guest->>FE: 거절 클릭
            FE->>GR: 초대 거절 요청
            GR->>GR: 초대 거절 처리
            GR->>RT: PARTICIPANT_DENIED 이벤트 발행
            RT-->>FE: 방장/참여자 목록 갱신 이벤트 전달
            GR-->>AI: 거절 결과 전달
            AI->>AI: 거절 완료 메시지 생성
            AI-->>FE: 거절 완료 메시지 반환
            FE-->>Guest: 메인 화면 유지
        end
        
    ```
    
- 게임 시작
    
    ```markdown
    sequenceDiagram
        autonumber
        actor Client as Client Page
        participant AI as AI Module
        participant GameRoom as GameRoom Module
        participant Realtime as Realtime Module
        participant Redis as Redis
    
        Client->>GameRoom: 게임 시작 요청
        GameRoom->>GameRoom: 참여자/방 상태 검증
        GameRoom->>GameRoom: gameState를 IN_PROGRESS로 변경
        GameRoom->>GameRoom: mission/turn 초기화
        GameRoom-->>Client: 시작 처리 결과 반환
        GameRoom->>Realtime: gameState, missionState 동기화
        Realtime->>Redis: 현재 게임 상태 및 브로드캐스트 이벤트 반영
        Realtime-->>Client: 게임 시작 브로드캐스트
        Realtime-->>Client: 게임 화면 진입 정보 전달
        Realtime-->>Client: 미션 안내 모달 이벤트 전달
    ```
    
- 게임 진행
    
    ```markdown
    sequenceDiagram
        autonumber
        actor Player as "턴 진행자"
        participant FE as "Frontend"
        participant RT as "실시간 모듈"
        participant Queue as "작업 큐"
        participant GR as "게임룸 모듈"
        participant AI as "AI 모듈"
        participant LLM as "LLM"
        participant CT as "컨테이너 모듈"
        participant Docker as "Docker"
    
        Player->>FE: 게임 화면 진입
        FE->>GR: 현재 게임/턴 상태 조회
        GR->>GR: 게임/미션/턴 상태 확인
        GR-->>FE: 현재 차례, 미션 진행 정보 반환
    
        
        RT->>RT: 방 세션 및 현재 턴 상태 관리
        RT-->>FE: 턴 시작 브로드캐스트
    
        Player->>FE: 코드 작성
        FE->>RT: 코드 실시간 동기화
    
        opt 힌트 보기
            FE->>GR: 힌트 요청
            GR->>GR: 저장된 힌트 조회
            GR-->>FE: 힌트 반환
        end
    
        alt 제출 버튼 클릭
            Player->>FE: 제출
            FE->>RT: 턴 제출 이벤트 전송
        else 시간 초과
            RT->>RT: 제한 시간 초과 감지
        end
    
        RT->>RT: 최신 코드 상태 캡처
        RT->>Queue: 제출 처리 작업 등록
    
        Queue-->>GR: 제출 처리 작업 전달
        GR->>GR: 턴 상태 검증 및 제출 코드 저장
    
        GR->>Queue: AI 테스트 생성 작업 등록
        Queue-->>AI: AI 테스트 생성 작업 전달
        AI->>LLM: 테스트 입력값 생성 요청
        LLM-->>AI: 테스트 입력값 반환
        AI-->>Queue: 테스트 생성 완료
    
        Queue-->>GR: 테스트 입력값 전달
        GR->>Queue: 코드 실행 작업 등록
        Queue-->>CT: 코드 실행 작업 전달
        CT->>Docker: 테스트 실행
        Docker-->>CT: 실행 결과 반환
        CT-->>Queue: 실행 결과 저장
    
        Queue-->>GR: 실행 결과 전달
        GR->>Queue: AI 결과 분석 작업 등록
        Queue-->>AI: AI 결과 분석 작업 전달
        AI->>LLM: 실행 결과 분석 요청
        LLM-->>AI: 성공/실패 및 피드백 반환
        AI-->>Queue: 분석 결과 저장
    
        Queue-->>GR: 분석 결과 전달
    
        alt 성공
            GR->>GR: 현재 단계 완료 처리
            GR->>RT: 다음 턴 시작 알림
            RT-->>FE: 다음 턴 브로드캐스트
        else 실패
            GR->>GR: 실패 횟수 증가
            GR->>RT: 실패 결과 및 다음 턴 알림
            AI->>RT: AI 피드백 전달
            RT-->>FE: 피드백 / 다음 턴 브로드캐스트
        else 처리 오류
            GR->>RT: 오류 안내
            RT-->>FE: 오류 메시지 표시
        end
    ```
    
- 게임 종료
    
    ```markdown
    sequenceDiagram
        autonumber
        actor Client as Client Page
        participant AI as AI Module
        participant GameRoom as GameRoom Module
        participant Realtime as Realtime Module
        participant Redis as Redis
    
        Client->>Realtime: 마지막 턴 제출 / 턴 종료 요청
        Realtime->>Redis: 제출 이벤트 및 최신 코드 상태 반영
        Realtime->>GameRoom: TURN_SUBMITTED(turnId, codeSnapshot)
        GameRoom->>GameRoom: turnSnapshot 저장
        GameRoom->>GameRoom: 게임 상태를 JUDGING로 변경
        GameRoom->>AI: 마지막 턴 분석 요청
        AI->>AI: 코드/미션 결과 분석
        AI-->>GameRoom: missionResult 반환
        GameRoom->>GameRoom: 결과 반영 및 gameState 갱신
        GameRoom->>GameRoom: gameState를 FINISHED로 변경
        GameRoom->>Realtime: 최종 gameState, missionResult 동기화
        Realtime->>Redis: 결과 이벤트 및 종료 상태 반영
        Realtime-->>Client: MISSION_RESULT 브로드캐스트
        Realtime-->>Client: 게임 종료/결과 화면 표시
        Client->>GameRoom: 게임 종료 버튼 클릭
        GameRoom->>GameRoom: 방 소속 상태 정리
        GameRoom->>Realtime: 메인 화면 복귀 상태 동기화
        Realtime->>Redis: 참여 상태 업데이트
        Realtime-->>Client: 메인 화면 복귀 이벤트 전달
    ```