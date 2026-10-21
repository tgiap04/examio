import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AccountRow } from '../roles/role-change.repository';

/** Statements specific to ban/unban (lock/lookup statements live in RoleChangeRepository). */
@Injectable()
export class UserStatusRepository {
    /**
     * Sets `isBanned` and bumps `authzVersion`. `deletedAt` is never SET by a ban;
     * an unban clears it only for accounts banned by the pre-RBAC admin path,
     * which also stamped `deletedAt`.
     */
    async setBanned(tx: Prisma.TransactionClient, id: string, isBanned: boolean): Promise<AccountRow> {
        return tx.user.update({
            where: { id },
            data: {
                isBanned,
                authzVersion: { increment: 1 },
                ...(isBanned ? {} : { deletedAt: null }),
            },
            select: { id: true, email: true, role: true, isSystemAdmin: true, isBanned: true, deletedAt: true, authzVersion: true },
        });
    }

    /** Deactivates every active session of the user and returns their `sid`s. */
    async deactivateSessions(tx: Prisma.TransactionClient, userId: string): Promise<Array<{ sessionId: string }>> {
        const sessions = await tx.userSession.findMany({
            where: { userId, isActive: true },
            select: { id: true, sessionId: true },
        });
        if (sessions.length === 0) return [];
        await tx.userSession.updateMany({
            where: { id: { in: sessions.map((s) => s.id) } },
            data: { isActive: false },
        });
        return sessions.map((s) => ({ sessionId: s.sessionId }));
    }
}
