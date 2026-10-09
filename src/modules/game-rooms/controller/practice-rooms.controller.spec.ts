import { PracticeRoomsController } from './practice-rooms.controller';
import { PracticeRoomsService } from '../service/practice-rooms.service';

describe('PracticeRoomsController', () => {
  it('returns only success after the practice room start flow completes', async () => {
    const practiceRoomsService: jest.Mocked<Pick<PracticeRoomsService, 'createAndStart'>> = {
      createAndStart: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new PracticeRoomsController(practiceRoomsService as never);

    await expect(
      controller.createPracticeRoom('user-1', {
        difficulty: 'HARD',
        missionTemplateId: '11111111-1111-4111-8111-111111111111',
      }),
    ).resolves.toEqual({ success: true });

    expect(practiceRoomsService.createAndStart).toHaveBeenCalledWith({
      ownerUserId: 'user-1',
      difficulty: 'HARD',
      missionTemplateId: '11111111-1111-4111-8111-111111111111',
    });
  });
});
