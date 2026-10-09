export enum GameRoomStatus {
  WAITING = 'WAITING',
  IN_PROGRESS = 'IN_PROGRESS',
  JUDGING = 'JUDGING',
  ANALYZED = 'ANALYZED',
  FINISHED = 'FINISHED',
}

export enum GameMode {
  MULTIPLAYER = 'MULTIPLAYER',
  PRACTICE = 'PRACTICE',
}

export enum GameRoomParticipantMembershipStatus {
  INVITED = 'INVITED',
  JOINED = 'JOINED',
  LEFT = 'LEFT',
  DENIED = 'DENIED',
}

export enum GameRoomParticipantRole {
  OWNER = 'OWNER',
  PARTICIPANT = 'PARTICIPANT',
}
