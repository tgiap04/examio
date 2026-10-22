import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';
import { ServerEvents, userRoom } from './study-room.events';

// Cầu nối để REST (đóng phòng) đẩy sự kiện xuống các socket đang mở.
// Gateway set server vào đây ở afterInit — tránh circular DI (service ↔ gateway).
// socket.io redis-adapter tự lan broadcast sang các instance khác.
@Injectable()
export class StudyRoomBroadcaster {
    private server: Server | null = null;

    setServer(server: Server): void {
        this.server = server;
    }

    async closeRoom(roomId: string): Promise<void> {
        if (!this.server) return;
        this.server.to(roomId).emit(ServerEvents.ROOM_CLOSED, { roomId });
        // Đá mọi socket ra khỏi phòng (mọi instance qua adapter).
        this.server.in(roomId).disconnectSockets(true);
    }

    /**
     * Sockets of `userId` whose token `av` is below `authzVersion` are told to
     * re-authenticate and then disconnected (every instance, via the adapter).
     * Idempotent: a re-delivered event finds no stale sockets. Returns the
     * number of sockets disconnected. A fan-out failure rejects on purpose: the
     * event consumer retries / dead-letters, so a revocation is never lost.
     */
    async reauthStaleSockets(userId: string, authzVersion: number): Promise<number> {
        if (!this.server) return 0;
        const sockets = await this.server.in(userRoom(userId)).fetchSockets();
        let count = 0;
        for (const s of sockets) {
            const av = (s.data as { av?: number })?.av ?? -1;
            if (av >= authzVersion) continue;
            s.emit(ServerEvents.AUTH_REAUTH, { reason: 'AUTHZ_CHANGED' });
            s.disconnect(true);
            count++;
        }
        return count;
    }
}
