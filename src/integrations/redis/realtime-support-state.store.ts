import { Injectable } from '@nestjs/common';
import {
  RealtimeCurrentTurnState,
  RealtimeFileContentBuffer,
  RealtimeSupportStateStore,
} from '../../modules/realtime/service/realtime.interfaces';

@Injectable()
export class InMemoryRealtimeSupportStateStore implements RealtimeSupportStateStore {
  private readonly currentTurnByRoom = new Map<string, RealtimeCurrentTurnState>();
  private readonly latestFileContentByRoom = new Map<
    string,
    Map<string, Map<string, RealtimeFileContentBuffer>>
  >();

  async saveCurrentTurnState(input: {
    gameRoomId: string;
    currentTurnId: string | null;
    currentTurnUserId: string | null;
  }): Promise<void> {
    this.currentTurnByRoom.set(input.gameRoomId, {
      currentTurnId: input.currentTurnId,
      currentTurnUserId: input.currentTurnUserId,
    });
  }

  async getCurrentTurnState(input: {
    gameRoomId: string;
  }): Promise<RealtimeCurrentTurnState | null> {
    return this.currentTurnByRoom.get(input.gameRoomId) ?? null;
  }

  async saveLatestFileContent(buffer: RealtimeFileContentBuffer): Promise<void> {
    const roomBuffer = this.latestFileContentByRoom.get(buffer.gameRoomId) ?? new Map();
    const turnBuffer = roomBuffer.get(buffer.turnId) ?? new Map();

    turnBuffer.set(buffer.filePath, buffer);
    roomBuffer.set(buffer.turnId, turnBuffer);
    this.latestFileContentByRoom.set(buffer.gameRoomId, roomBuffer);
  }

  async getLatestFileContent(input: {
    gameRoomId: string;
    turnId: string;
    filePath: string;
  }): Promise<RealtimeFileContentBuffer | null> {
    return this.latestFileContentByRoom.get(input.gameRoomId)?.get(input.turnId)?.get(input.filePath) ?? null;
  }

  async listLatestFileContents(input: {
    gameRoomId: string;
    turnId: string;
  }): Promise<RealtimeFileContentBuffer[]> {
    const turnBuffer = this.latestFileContentByRoom
      .get(input.gameRoomId)
      ?.get(input.turnId);

    if (!turnBuffer) {
      return [];
    }

    return Array.from(turnBuffer.values());
  }

  async clearLatestFileContents(input: {
    gameRoomId: string;
    turnId: string;
  }): Promise<void> {
    const roomBuffer = this.latestFileContentByRoom.get(input.gameRoomId);

    if (!roomBuffer) {
      return;
    }

    roomBuffer.delete(input.turnId);

    if (roomBuffer.size === 0) {
      this.latestFileContentByRoom.delete(input.gameRoomId);
    }
  }
}
