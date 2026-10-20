import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@examio/database';
import { RedisService } from '@examio/redis';
import {
    TOKEN_VERIFIER,
    TokenVerificationError,
    hasPermission,
    type TokenVerifier,
    extractHttpToken,
} from '@examio/auth-jwt';
import { decodeJwt } from 'jose';
import { Socket } from 'socket.io';

export interface SocketUser {
    id: string;
    name: string | null;
    avatar: string | null;
}

/** What the connection middleware stores in `socket.data` (besides `user`). */
export interface SocketSession {
    user: SocketUser;
    /** Authz version of the token the socket connected with. */
    av: number;
    /** Token expiry (epoch seconds): the socket is closed at this instant. */
    exp: number;
}

export type SocketAuthCode =
    | 'TOKEN_MISSING'
    | 'TOKEN_EXPIRED'
    | 'TOKEN_INVALID'
    | 'EMAIL_NOT_VERIFIED'
    | 'PERMISSION_DENIED'
    | 'TOKEN_STALE'
    | 'SERVICE_UNAVAILABLE'
    | 'UNAUTHORIZED';

/** The `code` becomes the `connect_error` message the client sees. */
export class SocketAuthError extends Error {
    constructor(readonly code: SocketAuthCode) {
        super(code);
        this.name = 'SocketAuthError';
    }
}

/**
 * Gateway-owned mirror of a user's current authz version (written by the
 * gateway on every role / ban change). Read-only here; a missing key means
 * "never changed". Must stay identical to the gateway's `authzVersionKey`
 * (`test/authz/authz-version-key.spec.ts` asserts it).
 */
export const authzVersionKey = (userId: string): string => `gw:user:${userId}:av`;

/**
 * Socket authentication (the guards skip `ws` contexts, so the connection
 * middleware is the only gate). Order: token present, signature / issuer /
 * audience / expiry (`@examio/auth-jwt`), verified email, `study_room:join`,
 * then the token's `av` against the gateway's Redis mirror (stale token =>
 * refresh and reconnect), then the account (banned / deleted). Every
 * infrastructure failure fails closed with SERVICE_UNAVAILABLE.
 * The token comes from `handshake.auth.token` first, then the same
 * Bearer/cookie order as HTTP.
 */
@Injectable()
export class StudyRoomSocketAuth {
    private readonly logger = new Logger(StudyRoomSocketAuth.name);

    constructor(
        @Inject(TOKEN_VERIFIER) private readonly verifyToken: TokenVerifier,
        private readonly prisma: PrismaService,
        private readonly redis: RedisService
    ) {}

    private extractToken(socket: Socket): string | undefined {
        const authToken = socket.handshake.auth?.token;
        if (typeof authToken === 'string' && authToken) return authToken;
        return extractHttpToken({ headers: socket.handshake.headers });
    }

    async authenticate(socket: Socket): Promise<SocketSession> {
        const token = this.extractToken(socket);
        if (!token) throw new SocketAuthError('TOKEN_MISSING');

        const principal = await this.verify(token);
        if (principal.kind !== 'user') throw new SocketAuthError('PERMISSION_DENIED');
        if (!principal.emailVerified) throw new SocketAuthError('EMAIL_NOT_VERIFIED');
        if (!hasPermission(principal.roles, 'study_room:join')) {
            throw new SocketAuthError('PERMISSION_DENIED');
        }

        await this.assertNotStale(principal.id, principal.av);
        const user = await this.loadUser(principal.id);
        // The token was verified above, so its `exp` is a trusted number.
        const exp = decodeJwt(token).exp;
        if (typeof exp !== 'number') throw new SocketAuthError('TOKEN_INVALID');
        return { user, av: principal.av, exp };
    }

    private async verify(token: string) {
        try {
            return await this.verifyToken(token);
        } catch (err) {
            if (err instanceof TokenVerificationError) {
                throw new SocketAuthError(err.code);
            }
            this.logger.warn(
                `Socket token verification failed: ${err instanceof Error ? err.message : String(err)}`
            );
            throw new SocketAuthError('TOKEN_INVALID');
        }
    }

    private async assertNotStale(userId: string, av: number): Promise<void> {
        let stored: string | null;
        try {
            stored = await this.redis.getClient().get(authzVersionKey(userId));
        } catch (err) {
            this.logger.warn(
                `av lookup failed: ${err instanceof Error ? err.message : String(err)}`
            );
            throw new SocketAuthError('SERVICE_UNAVAILABLE');
        }
        const current = stored === null ? NaN : Number(stored);
        if (Number.isFinite(current) && av < current) {
            throw new SocketAuthError('TOKEN_STALE');
        }
    }

    private async loadUser(userId: string): Promise<SocketUser> {
        let user;
        try {
            user = await this.prisma.user.findUnique({
                where: { id: userId },
                select: {
                    id: true,
                    name: true,
                    avatar: true,
                    isBanned: true,
                    deletedAt: true,
                },
            });
        } catch (err) {
            this.logger.warn(
                `Socket user lookup failed: ${err instanceof Error ? err.message : String(err)}`
            );
            throw new SocketAuthError('SERVICE_UNAVAILABLE');
        }
        if (!user || user.isBanned || user.deletedAt) {
            throw new SocketAuthError('UNAUTHORIZED');
        }
        return { id: user.id, name: user.name, avatar: user.avatar };
    }
}
