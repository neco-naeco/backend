export interface RankingScoreBreakdownResponse {
  clear: number;
  firstAttempt: number;
  time: number;
  failure: number;
}

export interface IndividualRankingEntry {
  rank: number;
  userId: string;
  nickname: string;
  score: number;
  clearedSteps: number;
  failedAttempts: number;
  firstAttemptClears: number;
  averageClearSeconds: number | null;
  scoreBreakdown: RankingScoreBreakdownResponse;
}

export interface TeamRankingEntry {
  rank: number;
  gameRoomId: string;
  score: number;
  difficulty: string;
  missionCleared: boolean;
  remainingStrikes: number;
  participants: Array<{ userId: string; nickname: string }>;
}
