import { Injectable } from '@nestjs/common';
import { PrismaService } from '@examio/database';
import { UserSession } from '@prisma/client';
import { RefreshTokenCipherService } from '@examio/common';

@Injectable()
export class UserSessionRepository {
    constructor(
        private readonly prisma: PrismaService,
        private readonly refreshTokenCipher: RefreshTokenCipherService
    ) {}

    /**
     * Refresh tokens are encrypted at rest (deterministic AES-256-GCM via
     * RefreshTokenCipherService). Every write stores `seal(plaintext)`,
     * every lookup queries by `seal(incoming)` — the raw token is never
     * persisted and never used directly in a `where` clause.
     */
    async create(data: {
        id: string;
        userId: string;
        sessionId: string;
        refreshToken: string;
        deviceId: string;
        deviceName?: string | null;
        browser?: string | null;
        os?: string | null;
        ipAddress?: string | null;
        country?: string | null;
        city?: string | null;
        expiresAt: Date;
    }): Promise<UserSession> {
        return this.prisma.userSession.create({
            data: {
                ...data,
                refreshToken: this.refreshTokenCipher.seal(data.refreshToken),
            },
        });
    }

    async findByRefreshToken(
        refreshToken: string
    ): Promise<UserSession | null> {
        // Match the current token, or the previous token while it is still
        // inside its grace window. This keeps concurrent tabs/requests that
        // hold the just-rotated token from being treated as invalid.
        const now = new Date();
        const sealed = this.refreshTokenCipher.seal(refreshToken);
        return this.prisma.userSession.findFirst({
            where: {
                OR: [
                    { refreshToken: sealed },
                    {
                        previousRefreshToken: sealed,
                        previousTokenExpiresAt: { gt: now },
                    },
                ],
            },
        });
    }

    async findBySessionId(sessionId: string): Promise<UserSession | null> {
        return this.prisma.userSession.findUnique({
            where: { sessionId },
        });
    }

    async findActiveSessionsByUserId(userId: string): Promise<UserSession[]> {
        return this.prisma.userSession.findMany({
            where: {
                userId,
                isActive: true,
            },
            orderBy: { lastActivity: 'desc' },
        });
    }

    async updateLastActivity(sessionId: string): Promise<void> {
        await this.prisma.userSession.update({
            where: { sessionId },
            data: { lastActivity: new Date() },
        });
    }

    async rotateRefreshToken(
        sessionId: string,
        refreshToken: string
    ): Promise<void> {
        await this.prisma.userSession.update({
            where: { sessionId },
            data: {
                refreshToken: this.refreshTokenCipher.seal(refreshToken),
                lastActivity: new Date(),
            },
        });
    }

    // Cửa sổ ân hạn cho refresh token cũ sau khi rotate (mili giây).
    private static readonly REFRESH_GRACE_MS = 60 * 1000;

    /**
     * Rotate refresh token theo cơ chế grace-period.
     *
     * - Nếu `currentRefreshToken` là token hiện hành: rotate sang
     *   `nextRefreshToken`, đồng thời giữ token cũ làm `previousRefreshToken`
     *   trong REFRESH_GRACE_MS để các request song song không bị vô hiệu hóa.
     * - Nếu `currentRefreshToken` là một `previousRefreshToken` còn trong grace
     *   window (request đến sau khi tab khác đã rotate): KHÔNG rotate lại, trả
     *   về token hiện hành để dùng tiếp (idempotent).
     *
     * @returns token hợp lệ để cấp lại cho client, hoặc null nếu không khớp.
     */
    async rotateRefreshTokenIfCurrent(
        sessionId: string,
        currentRefreshToken: string,
        nextRefreshToken: string
    ): Promise<string | null> {
        const now = new Date();
        const graceUntil = new Date(
            now.getTime() + UserSessionRepository.REFRESH_GRACE_MS
        );
        const sealedCurrent = this.refreshTokenCipher.seal(currentRefreshToken);
        const sealedNext = this.refreshTokenCipher.seal(nextRefreshToken);

        // Trường hợp 1: token hiện hành → rotate. `nextRefreshToken` is
        // returned as-is (plaintext) — it is the caller's own freshly
        // generated value, never something read back from the sealed column.
        const rotated = await this.prisma.userSession.updateMany({
            where: {
                sessionId,
                refreshToken: sealedCurrent,
                isActive: true,
                expiresAt: { gt: now },
            },
            data: {
                refreshToken: sealedNext,
                previousRefreshToken: sealedCurrent,
                previousTokenExpiresAt: graceUntil,
                lastActivity: now,
            },
        });

        if (rotated.count === 1) {
            return nextRefreshToken;
        }

        // Trường hợp 2: token nằm trong grace window (đã rotate ở request khác).
        // `session.refreshToken` is the sealed current token stored by the
        // request that won the rotation race — open() it before handing it
        // back to the caller, which must return plaintext to the client.
        const session = await this.prisma.userSession.findFirst({
            where: {
                sessionId,
                previousRefreshToken: sealedCurrent,
                previousTokenExpiresAt: { gt: now },
                isActive: true,
                expiresAt: { gt: now },
            },
        });

        return session
            ? this.refreshTokenCipher.open(session.refreshToken)
            : null;
    }

    async deactivateSession(id: string): Promise<void> {
        await this.prisma.userSession.update({
            where: { id },
            data: { isActive: false },
        });
    }

    async deactivateByRefreshToken(refreshToken: string): Promise<void> {
        await this.prisma.userSession.updateMany({
            where: { refreshToken: this.refreshTokenCipher.seal(refreshToken) },
            data: { isActive: false },
        });
    }

    /**
     * Deactivate every active session for a user, including the current
     * one. Used after a password reset/change so a stolen session cannot
     * survive the credential rotation.
     */
    async deactivateAllSessions(userId: string): Promise<number> {
        const result = await this.prisma.userSession.updateMany({
            where: {
                userId,
                isActive: true,
            },
            data: { isActive: false },
        });
        return result.count;
    }

    async deactivateAllOtherSessions(
        userId: string,
        currentSessionId: string
    ): Promise<number> {
        const result = await this.prisma.userSession.updateMany({
            where: {
                userId,
                sessionId: { not: currentSessionId },
                isActive: true,
            },
            data: { isActive: false },
        });
        return result.count;
    }

    async findById(id: string): Promise<UserSession | null> {
        return this.prisma.userSession.findFirst({
            where: { id },
        });
    }

    // Cleanup methods for cron job
    async deleteExpiredSessions(): Promise<number> {
        const result = await this.prisma.userSession.deleteMany({
            where: {
                expiresAt: { lt: new Date() },
            },
        });
        return result.count;
    }

    async deactivateInactiveSessions(inactiveDays: number): Promise<number> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - inactiveDays);

        const result = await this.prisma.userSession.updateMany({
            where: {
                lastActivity: { lt: cutoffDate },
                isActive: true,
            },
            data: { isActive: false },
        });
        return result.count;
    }

    async deleteOldSessions(retentionDays: number): Promise<number> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

        const result = await this.prisma.userSession.deleteMany({
            where: {
                createdAt: { lt: cutoffDate },
            },
        });
        return result.count;
    }
}
