Table game_rooms {
  id uuid [primary key, note: 'gameRoomId']
  owner_user_id uuid [not null, note: '외부 Auth 서버의 userId']
  status text [not null, note: 'WAITING, IN_PROGRESS, JUDGING, ANALYZED, FINISHED']
  difficulty text [not null, note: 'EASY, NORMAL, HARD']
  time_limit_seconds integer [not null]
  max_strike_count integer [not null]
  min_participants integer [not null]
  max_participants integer [not null]
  created_at timestamptz [not null]
  updated_at timestamptz [not null]
}

Table game_room_participants {
  id uuid [primary key]
  game_room_id uuid [not null]
  user_id uuid [not null, note: '외부 Auth 서버의 userId']
  role text [not null, note: 'OWNER, PARTICIPANT']
  membership_status text [not null, note: 'INVITED, JOINED, LEFT, DENIED']
  created_at timestamptz [not null]
  updated_at timestamptz [not null]
}

Table docker_images {
  id uuid [primary key, note: 'dockerImageId']
  image_name text [not null, note: '예: neconaeco/python-runner']
  image_tag text [not null, note: '예: python-3.12-v1']
  image_uri text [not null, note: '실제 pull 대상 전체 URI']
  registry_provider text [not null, note: '현재는 로컬에서만']
  runtime_image_id text [note: 'Container Runtime의 runtimeImageId']
  language text [note: '이미지가 담당하는 기본 언어']
  metadata_json jsonb [note: 'baseImage, installedPackages, resourceLimitProfile 등']
  created_at timestamptz [not null]
  updated_at timestamptz [not null]
  deprecated_at timestamptz
}

Table docker_image_deployments {
  id uuid [primary key, note: 'dockerImageDeploymentId']
  docker_image_id uuid [not null]
  deployed_by_user_id uuid [note: '배포 실행 사용자. 외부 Auth 서버의 userId']
  game_room_mission_id uuid [note: '실행 중 미션 반영 배포면 연결']
  deployment_status text [not null, note: 'PENDING, DEPLOYED, FAILED, ROLLED_BACK']
  deployed_at timestamptz
  created_at timestamptz [not null]
  updated_at timestamptz [not null]
}

Table mission_templates {
  id uuid [primary key, note: 'missionTemplateId']
  title text [not null]
  description text [not null]
  language text [not null]
  difficulty text [not null, note: 'EASY, NORMAL, HARD']
  default_time_limit_seconds integer [not null]
  default_max_strike_count integer [not null]
  docker_image_id uuid [not null]
  success_criteria text [not null, note: '미션 성공 판단 기준']
  judge_policy_json jsonb [not null, note: 'judgeType, inputGenerationRule 등']
  project_structure_json jsonb [not null, note: 'rootPath, entryFilePath, files']
  created_at timestamptz [not null]
  updated_at timestamptz [not null]
}

Table mission_template_steps {
  id uuid [primary key, note: 'missionTemplateStepId']
  mission_template_id uuid [not null]
  step_order integer [not null, note: '1부터 시작하는 진행 순서']
  title text [not null]
  description text [not null, note: '단계별 안내 문구']
  target_file_path text [not null, note: '코딩해야 하는 파일 경로. 예: main.py']
  success_criteria text [not null, note: '단계 완료 판단 기준']
  judge_policy_json jsonb [not null, note: '단계 전용 judgeType, testCases, comparisonPolicy 등']
  hint_text text [note: '기본 힌트 문구']
  created_at timestamptz [not null]
  updated_at timestamptz [not null]
}

Table game_room_missions {
  id uuid [primary key, note: 'missionId']
  game_room_id uuid [not null]
  mission_template_id uuid [not null]
  current_step_id uuid [note: '현재 진행 중인 gameRoomMissionStepId']
  container_id text [note: '외부 Container Runtime의 containerId']
  strike_count integer [not null, default: 0]
  max_strike_count integer [not null]
  limit_time_seconds integer [not null]
  started_at timestamptz
  finished_at timestamptz
  created_at timestamptz [not null]
  updated_at timestamptz [not null]
}

Table game_room_mission_steps {
  id uuid [primary key, note: 'gameRoomMissionStepId']
  game_room_mission_id uuid [not null]
  mission_template_step_id uuid [not null]
  status text [not null, note: 'LOCKED, READY, IN_PROGRESS, CLEARED, FAILED']
  started_at timestamptz
  cleared_at timestamptz
  created_at timestamptz [not null]
  updated_at timestamptz [not null]
}

Table turns {
  id uuid [primary key, note: 'turnId']
  game_room_id uuid [not null]
  mission_id uuid [not null]
  player_user_id uuid [not null, note: '외부 Auth 서버의 userId']
  turn_number integer [not null]
  status text [not null, note: 'IN_PROGRESS, SUBMITTED, TIMEOUT']
  started_at timestamptz [not null]
  deadline_at timestamptz [not null]
  ended_at timestamptz
  created_at timestamptz [not null]
}

Table turn_snapshots {
  id uuid [primary key, note: 'turnSnapshotId']
  game_room_id uuid [not null]
  turn_id uuid [not null, unique]
  user_id uuid [not null, note: '턴 종료 제출 사용자 userId']
  code_snapshot_json jsonb [not null, note: '턴 종료 시점 CodeSnapshot(현재 파일만)']
  created_at timestamptz [not null]
}

Table executions {
  id uuid [primary key, note: 'executionRequestId / executionResultId 묶음 저장']
  game_room_id uuid [not null]
  mission_id uuid [not null]
  turn_id uuid [note: '턴 외 실행이면 null 허용']
  user_id uuid [not null, note: '외부 Auth 서버의 userId']
  session_id text [note: 'Realtime 서버의 sessionId']
  command text [not null]
  status text [not null, note: 'PENDING, RUNNING, SUCCESS, FAILED, TIMEOUT']
  stdout text
  stderr text
  exit_code integer
  started_at timestamptz
  finished_at timestamptz
  created_at timestamptz [not null]
  updated_at timestamptz [not null]
}

Table mission_results {
  id uuid [primary key]
  game_room_id uuid [not null]
  mission_id uuid [not null]
  turn_id uuid [not null]
  judge_status text [not null, note: 'PASSED, FAILED, ERROR']
  result_payload_json jsonb [not null, note: 'selectedInputs, expectedOutputs, actualOutputs, detectedIssues, suggestedCommand']
  occurred_at timestamptz [not null]
  created_at timestamptz [not null]
}

Ref: game_room_participants.game_room_id > game_rooms.id
Ref: docker_image_deployments.docker_image_id > docker_images.id
Ref: docker_image_deployments.game_room_mission_id > game_room_missions.id
Ref: mission_templates.docker_image_id > docker_images.id
Ref: mission_template_steps.mission_template_id > mission_templates.id
Ref: game_room_missions.game_room_id > game_rooms.id
Ref: game_room_missions.mission_template_id > mission_templates.id
Ref: game_room_missions.current_step_id > game_room_mission_steps.id
Ref: game_room_mission_steps.game_room_mission_id > game_room_missions.id
Ref: game_room_mission_steps.mission_template_step_id > mission_template_steps.id
Ref: turns.game_room_id > game_rooms.id
Ref: turns.mission_id > game_room_missions.id
Ref: turn_snapshots.turn_id > turns.id
Ref: executions.game_room_id > game_rooms.id
Ref: executions.turn_id > turns.id
Ref: mission_results.mission_id > game_room_missions.id


Table ai_game_sessions {
  id uuid [primary key, note: 'aiGameSessionId']
  game_room_id uuid [not null, note: '외부 GameRoom 서버의 gameRoomId']
  provider_conversation_id text [note: '외부 LLM Provider의 conversationId']
  provider text [not null]
  llm_model text [not null]
  status text [not null, note: 'ACTIVE, CLOSED, ERROR']
  created_at timestamptz [not null]
  updated_at timestamptz [not null]
  closed_at timestamptz
}

Table ai_game_requests {
  id uuid [primary key]
  ai_game_session_id uuid [not null]
  // source_request_id text [note: 'requestId, debugRequestId, judgeRequestId 등']
  request_type text [not null, note: 'DEBUG, JUDGE']
  // requester_user_id uuid [not null, note: '외부 Auth 서버의 userId']
  turn_id uuid [note: '외부 GameRoom 서버의 turnId']
  mission_id uuid [note: '외부 GameRoom 서버의 missionId']
  request_payload jsonb [not null, note: 'context, codeSnapshot, executionResult 등']
  response_payload jsonb [note: 'message, missionResult 등']
  status text [not null, note: 'RECEIVED, COMPLETED, FAILED']
  requested_at timestamptz [not null]
  responded_at timestamptz
  created_at timestamptz [not null]
  updated_at timestamptz [not null]
}

Table ai_chat_sessions {
  id uuid [primary key, note: 'aiChatSessionId']
  requester_user_id uuid [not null, note: '대화를 시작한 사용자. 외부 Auth 서버의 userId']
  game_room_id uuid [note: '이미 참여 중인 방 컨텍스트가 있으면 연결']
  provider_conversation_id text [note: '외부 LLM Provider의 conversationId']
  provider text [not null]
  llm_model text [not null]
  status text [not null, note: 'ACTIVE, CLOSED, ERROR']
  created_at timestamptz [not null]
  updated_at timestamptz [not null]
  closed_at timestamptz
}

Table ai_chat_requests {
  id uuid [primary key]
  ai_chat_session_id uuid [not null]
  request_type text [not null, note: 'ROOM_CREATE, USER_INVITE, ROOM_JOIN, USER_INVITE_DENY, GAME_START']
  source_message_id uuid [note: '사용자 입력 메시지 ai_chat_messages.id']
  request_payload jsonb [not null, note: 'userMessage, mentionedNickname, desiredDifficulty, desiredTopic 등']
  response_payload jsonb [note: 'assistantMessage, extractedCommand, roomCreationDraft, inviteTargets 등']
  status text [not null, note: 'RECEIVED, COMPLETED, FAILED']
  requested_at timestamptz [not null]
  responded_at timestamptz
  created_at timestamptz [not null]
  updated_at timestamptz [not null]
}

Table ai_chat_messages {
  id uuid [primary key]
  ai_chat_session_id uuid [not null]
  ai_chat_request_id uuid [null]
  sender_type text [not null, note: 'USER, ASSISTANT, SYSTEM']
  sender_user_id uuid [note: 'USER 또는 SYSTEM 주체가 외부 Auth 서버 사용자일 때']
  message_type text [not null, note: 'TEXT, COMMAND_RESULT, SYSTEM_NOTICE']
  content text [not null, note: '실제 대화 본문']
  metadata_json jsonb [note: '추출된 intent, 생성된 roomId, inviteeNickname 목록 등']
  created_at timestamptz [not null]
}

Table ai_realtime_events {
  id uuid [primary key]
  ai_game_request_id uuid [not null]
  ai_game_session_id uuid [not null]
  game_room_id uuid [not null, note: '외부 GameRoom 서버의 gameRoomId']
  event_type text [not null, note: 'SYSTEM_NOTIFICATION, HINT_POPUP, DEBUG_SUMMARY, MISSION_FEEDBACK, MISSION_RESULT']
  target_user_id uuid [note: '외부 Auth 서버의 userId']
  message text [not null]
  payload_json jsonb [note: 'missionResult 등 브로드캐스트 payload']
  delivery_status text [not null, note: 'PENDING, SENT, FAILED']
  occurred_at timestamptz [not null]
  delivered_at timestamptz
  created_at timestamptz [not null]
}

Table ai_prompt_templates {
  id uuid [primary key]
  template_key text [not null, unique]
  template_name text [not null]
  purpose text [not null, note: 'chat_command, mission_feedback, judge']
  template_text text [not null]
  variables_json jsonb [note: '사용 변수 정의']
  is_active boolean [not null, default: true]
  created_at timestamptz [not null]
  updated_at timestamptz [not null]
}

Ref: ai_game_requests.ai_game_session_id > ai_game_sessions.id
Ref: ai_chat_requests.ai_chat_session_id > ai_chat_sessions.id
Ref: ai_chat_messages.ai_chat_session_id > ai_chat_sessions.id
Ref: ai_realtime_events.ai_game_request_id > ai_game_requests.id
Ref: ai_realtime_events.ai_game_session_id > ai_game_sessions.id



Table users {
  id uuid [primary key, note: 'Auth 서버 내부 userId']
  login_id text [not null, unique, note: '로그인 식별자']
  nickname text [not null]
  password_hash text [not null, note: '클라이언트가 전달한 passwordHash 기준 저장값']
  email text [unique]
  created_at timestamptz [not null]
}

Table refresh_tokens {
  id uuid [primary key]
  user_id uuid [not null]
  token_hash text [not null, unique, note: '원문 refreshToken 대신 해시 저장']
  expires_at timestamptz [not null]
  revoked_at timestamptz
  created_at timestamptz [not null]
}

Ref: refresh_tokens.user_id > users.id
