import { MissionResultJudgeStatus } from '@shared/enums';
import { calculateAttemptScore, calculateTeamCompletionBonus } from './ranking-score.policy';

describe('ranking score policy', () => {
  const startedAt = new Date('2026-10-11T00:00:00.000Z');
  const deadlineAt = new Date('2026-10-11T00:01:00.000Z');

  it('rewards a first-attempt clear using difficulty and remaining time', () => {
    expect(
      calculateAttemptScore({
        difficulty: 'NORMAL',
        judgeStatus: MissionResultJudgeStatus.PASSED,
        startedAt,
        deadlineAt,
        endedAt: new Date('2026-10-11T00:00:30.000Z'),
        isFirstAttempt: true,
      }),
    ).toEqual({
      total: 218,
      clear: 150,
      firstAttempt: 45,
      time: 23,
      failure: 0,
    });
  });

  it('penalizes failed attempts but never penalizes system errors', () => {
    expect(
      calculateAttemptScore({
        difficulty: 'HARD',
        judgeStatus: MissionResultJudgeStatus.FAILED,
        startedAt,
        deadlineAt,
        endedAt: deadlineAt,
        isFirstAttempt: false,
      }).total,
    ).toBe(-40);

    expect(
      calculateAttemptScore({
        difficulty: 'HARD',
        judgeStatus: MissionResultJudgeStatus.ERROR,
        startedAt,
        deadlineAt,
        endedAt: deadlineAt,
        isFirstAttempt: false,
      }).total,
    ).toBe(0);
  });

  it('adds a team bonus only when the mission is cleared', () => {
    expect(
      calculateTeamCompletionBonus({
        difficulty: 'HARD',
        missionCleared: true,
        remainingStrikes: 2,
      }),
    ).toBe(500);
    expect(
      calculateTeamCompletionBonus({
        difficulty: 'HARD',
        missionCleared: false,
        remainingStrikes: 2,
      }),
    ).toBe(0);
  });
});
