import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';
import { ServerEvents } from './study-room.events';

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
}
