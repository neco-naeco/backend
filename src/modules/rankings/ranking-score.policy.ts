import { MissionResultJudgeStatus } from '@shared/enums';

export interface RankingAttempt {
  difficulty: string;
  judgeStatus: MissionResultJudgeStatus;
  startedAt: Date;
  deadlineAt: Date;
  endedAt: Date | null;
  isFirstAttempt: boolean;
}

export interface RankingScoreBreakdown {
  total: number;
  clear: number;
  firstAttempt: number;
  time: number;
  failure: number;
}

const DIFFICULTY_MULTIPLIER: Record<string, number> = {
  EASY: 1,
  NORMAL: 1.5,
  HARD: 2,
};

export function calculateAttemptScore(attempt: RankingAttempt): RankingScoreBreakdown {
  const multiplier = DIFFICULTY_MULTIPLIER[attempt.difficulty] ?? 1;

  if (attempt.judgeStatus === MissionResultJudgeStatus.ERROR) {
    return { total: 0, clear: 0, firstAttempt: 0, time: 0, failure: 0 };
  }

  if (attempt.judgeStatus === MissionResultJudgeStatus.FAILED) {
    const failure = -Math.round(20 * multiplier);
    return { total: failure, clear: 0, firstAttempt: 0, time: 0, failure };
  }

  const clear = Math.round(100 * multiplier);
  const firstAttempt = attempt.isFirstAttempt ? Math.round(30 * multiplier) : 0;
  const time = calculateTimeBonus(attempt, multiplier);

  return {
    total: clear + firstAttempt + time,
    clear,
    firstAttempt,
    time,
    failure: 0,
  };
}

export function calculateTeamCompletionBonus(input: {
  difficulty: string;
  missionCleared: boolean;
  remainingStrikes: number;
}): number {
  if (!input.missionCleared) {
    return 0;
  }

  const multiplier = DIFFICULTY_MULTIPLIER[input.difficulty] ?? 1;
  return Math.round((200 + Math.max(0, input.remainingStrikes) * 25) * multiplier);
}

function calculateTimeBonus(attempt: RankingAttempt, multiplier: number): number {
  if (!attempt.endedAt) {
    return 0;
  }

  const durationMs = attempt.deadlineAt.getTime() - attempt.startedAt.getTime();
  if (durationMs <= 0) {
    return 0;
  }

  const remainingRatio = Math.max(
    0,
    Math.min(1, (attempt.deadlineAt.getTime() - attempt.endedAt.getTime()) / durationMs),
  );
  return Math.round(30 * multiplier * remainingRatio);
}
