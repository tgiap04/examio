import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@examio/database';
import * as cookie from 'cookie';
import { Socket } from 'socket.io';

export interface SocketUser {
    id: string;
    name: string | null;
    avatar: string | null;
}

// Xác thực socket qua JWT — cùng logic AuthGuard (verify + session active + user hợp lệ).
// Token lấy từ handshake.auth.token (ưu tiên), rồi cookie `token`.
@Injectable()
export class StudyRoomSocketAuth {
    constructor(
        private readonly jwtService: JwtService,
        private readonly prisma: PrismaService
    ) {}

    private extractToken(socket: Socket): string | undefined {
        const authToken = socket.handshake.auth?.token;
        if (typeof authToken === 'string' && authToken) return authToken;

        const cookieHeader = socket.handshake.headers.cookie;
        if (cookieHeader) {
            const cookies = cookie.parse(cookieHeader);
            if (cookies.token) return cookies.token;
        }
        return undefined;
    }

    async authenticate(socket: Socket): Promise<SocketUser | null> {
        const token = this.extractToken(socket);
        if (!token) return null;

        try {
            const decoded: { userId?: string; sessionId?: string } =
                await this.jwtService.verifyAsync(token, {
                    secret: process.env.JWT_SECRET,
                });

            if (decoded.sessionId) {
                const session = await this.prisma.userSession.findUnique({
                    where: { sessionId: decoded.sessionId },
                    select: { isActive: true },
                });
                if (!session || !session.isActive) return null;
            }

            const user = await this.prisma.user.findUnique({
                where: { id: decoded.userId },
                select: {
                    id: true,
                    name: true,
                    avatar: true,
                    isBanned: true,
                    isVerified: true,
                    deletedAt: true,
                },
            });

            if (!user || user.isBanned || user.deletedAt || !user.isVerified) {
                return null;
            }
            return { id: user.id, name: user.name, avatar: user.avatar };
        } catch {
            return null;
        }
    }
}
