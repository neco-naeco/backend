import { DataSource } from 'typeorm';
import { MissionResultJudgeStatus } from '@shared/enums';
import { RankingsService } from './rankings.service';

describe('RankingsService', () => {
  const query = jest.fn();
  const service = new RankingsService({ query } as unknown as DataSource);
  const startedAt = new Date('2026-10-11T00:00:00.000Z');
  const deadlineAt = new Date('2026-10-11T00:01:00.000Z');
  const endedAt = new Date('2026-10-11T00:00:30.000Z');

  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue([
      attempt({
        turnId: 'turn-1',
        playerUserId: 'user-1',
        nickname: '고양이',
        stepId: 'step-1',
        judgeStatus: MissionResultJudgeStatus.PASSED,
      }),
      attempt({
        turnId: 'turn-2',
        playerUserId: 'user-1',
        nickname: '고양이',
        stepId: 'step-2',
        judgeStatus: MissionResultJudgeStatus.FAILED,
      }),
      attempt({
        turnId: 'turn-3',
        playerUserId: 'user-2',
        nickname: '토끼',
        stepId: 'step-2',
        judgeStatus: MissionResultJudgeStatus.PASSED,
        missionFinished: true,
      }),
    ]);
  });

  it('ranks individual contribution from deterministic turn results', async () => {
    await expect(service.listIndividualRankings(10)).resolves.toEqual([
      expect.objectContaining({
        rank: 1,
        userId: 'user-1',
        score: 125,
        clearedSteps: 1,
        failedAttempts: 1,
        firstAttemptClears: 1,
      }),
      expect.objectContaining({
        rank: 2,
        userId: 'user-2',
        score: 115,
        firstAttemptClears: 0,
      }),
    ]);
  });

  it('adds mission-clear and remaining-strike bonuses to the team score', async () => {
    await expect(service.listTeamRankings(10)).resolves.toEqual([
      {
        rank: 1,
        gameRoomId: 'room-1',
        score: 490,
        difficulty: 'EASY',
        missionCleared: true,
        remainingStrikes: 2,
        participants: [
          { userId: 'user-1', nickname: '고양이' },
          { userId: 'user-2', nickname: '토끼' },
        ],
      },
    ]);
    expect(query.mock.calls[0][0]).toContain("gr.mode = 'MULTIPLAYER'");
  });

  it('does not consume the first-attempt bonus when the server reports an error', async () => {
    query.mockResolvedValue([
      attempt({
        turnId: 'turn-error',
        judgeStatus: MissionResultJudgeStatus.ERROR,
      }),
      attempt({
        turnId: 'turn-pass',
        judgeStatus: MissionResultJudgeStatus.PASSED,
      }),
    ]);

    await expect(service.listIndividualRankings(10)).resolves.toEqual([
      expect.objectContaining({
        score: 145,
        firstAttemptClears: 1,
      }),
    ]);
  });

  function attempt(
    overrides: Partial<{
      turnId: string;
      playerUserId: string;
      nickname: string;
      stepId: string;
      judgeStatus: MissionResultJudgeStatus;
      missionFinished: boolean;
    }>,
  ) {
    return {
      gameRoomId: 'room-1',
      turnId: 'turn-1',
      playerUserId: 'user-1',
      nickname: '고양이',
      difficulty: 'EASY',
      maxStrikeCount: 3,
      strikeCount: 1,
      startedAt,
      deadlineAt,
      endedAt,
      judgeStatus: MissionResultJudgeStatus.PASSED,
      stepId: 'step-1',
      missionFinished: false,
      ...overrides,
    };
  }
});
