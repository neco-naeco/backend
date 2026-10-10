import { EntityManager } from 'typeorm';
import { GameItemType } from '@shared/enums';
import { GameRoomItemEntity } from './entity/game-room-item.entity';

export interface GameItemState {
  itemType: GameItemType;
  remainingQuantity: number;
}

// The caller supplies the transaction that also reads the turn deadline.
// Missing inventory is a legacy/waiting room, never a reason to allocate.
export async function loadGameItemState(
  manager: EntityManager,
  gameRoomId: string,
): Promise<GameItemState[]> {
  const item = await manager.getRepository(GameRoomItemEntity).findOne({
    where: { gameRoomId, itemType: GameItemType.TIME_EXTENSION_30 },
  });
  return [{ itemType: GameItemType.TIME_EXTENSION_30, remainingQuantity: item?.quantity ?? 0 }];
}
