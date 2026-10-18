import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@examio/database';
import {
    TOKEN_VERIFIER,
    type TokenVerifier,
    extractHttpToken,
} from '@examio/auth-jwt';
import { Socket } from 'socket.io';

export interface SocketUser {
    id: string;
    name: string | null;
    avatar: string | null;
}

/**
 * Socket authentication (the guards skip `ws` contexts, so the connection
 * middleware is the only gate). The access token is verified statelessly with
 * `@examio/auth-jwt` (RS256 / JWKS, `email_verified` required); the token comes
 * from `handshake.auth.token` first, then the same Bearer/cookie order as HTTP.
 *
 * The one DB read is display data (`name`, `avatar`) plus a banned/deleted
 * check, kept so a banned user still cannot open a socket until phase 06 adds
 * the `av` staleness check (and phase 12 the public-profile lookup).
 */
@Injectable()
export class StudyRoomSocketAuth {
    private readonly logger = new Logger(StudyRoomSocketAuth.name);

    constructor(
        @Inject(TOKEN_VERIFIER) private readonly verifyToken: TokenVerifier,
        private readonly prisma: PrismaService
    ) {}

    private extractToken(socket: Socket): string | undefined {
        const authToken = socket.handshake.auth?.token;
        if (typeof authToken === 'string' && authToken) return authToken;
        return extractHttpToken({ headers: socket.handshake.headers });
    }

    async authenticate(socket: Socket): Promise<SocketUser | null> {
        const token = this.extractToken(socket);
        if (!token) return null;

        try {
            const principal = await this.verifyToken(token);
            if (principal.kind !== 'user' || !principal.emailVerified) {
                return null;
            }

            const user = await this.prisma.user.findUnique({
                where: { id: principal.id },
                select: {
                    id: true,
                    name: true,
                    avatar: true,
                    isBanned: true,
                    deletedAt: true,
                },
            });
            if (!user || user.isBanned || user.deletedAt) return null;
            return { id: user.id, name: user.name, avatar: user.avatar };
        } catch (err) {
            // A bad/expired token is routine; anything else deserves a trace.
            if ((err as { name?: string })?.name !== 'TokenVerificationError') {
                this.logger.warn(
                    `Socket authentication failed: ${err instanceof Error ? err.message : String(err)}`
                );
            }
            return null;
        }
    }
}
