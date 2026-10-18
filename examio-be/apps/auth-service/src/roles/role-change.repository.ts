import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@examio/database';

export type BaseRoleName = 'STUDENT' | 'TEACHER';

export interface AccountRow {
    id: string;
    email: string;
    role: BaseRoleName;
    isSystemAdmin: boolean;
    isBanned: boolean;
    deletedAt: Date | null;
    authzVersion: number;
}

export interface RoleChangeLogInput {
    id: string;
    targetUserId: string;
    targetEmail: string;
    actorUserId: string | null;
    actorEmail: string;
    fromRole: BaseRoleName;
    toRole: BaseRoleName;
    fromAdmin: boolean;
    toAdmin: boolean;
    reason: string | null;
    source: string;
}

const ACCOUNT_COLUMNS = Prisma.sql`id, email, role::text AS role, "isSystemAdmin", "isBanned", "deletedAt", "authzVersion"`;

/** Every statement of the role-change transaction (kept thin so the service is unit-testable). */
@Injectable()
export class RoleChangeRepository {
    constructor(private readonly prisma: PrismaService) {}

    transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
        return this.prisma.$transaction(fn, { maxWait: 5000, timeout: 10000 });
    }

    /** Serializes every role change (and ban) cluster-wide for the tx's lifetime. */
    async lock(tx: Prisma.TransactionClient): Promise<void> {
        // $executeRaw: the function returns `void`, which $queryRaw cannot deserialize.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('role-change'))`;
    }

    async findActor(tx: Prisma.TransactionClient, id: string): Promise<AccountRow | null> {
        const rows = await tx.$queryRaw<AccountRow[]>`SELECT ${ACCOUNT_COLUMNS} FROM "User" WHERE id = ${id}`;
        return rows[0] ?? null;
    }

    async findTargetForUpdate(tx: Prisma.TransactionClient, id: string): Promise<AccountRow | null> {
        const rows = await tx.$queryRaw<AccountRow[]>`SELECT ${ACCOUNT_COLUMNS} FROM "User" WHERE id = ${id} FOR UPDATE`;
        return rows[0] ?? null;
    }

    async countActiveAdmins(tx: Prisma.TransactionClient): Promise<number> {
        const rows = await tx.$queryRaw<Array<{ n: number }>>`SELECT count(*)::int AS n FROM "User" WHERE "isSystemAdmin" AND NOT "isBanned" AND "deletedAt" IS NULL`;
        return rows[0]?.n ?? 0;
    }

    async updateAccount(
        tx: Prisma.TransactionClient,
        id: string,
        patch: { role: BaseRoleName; isSystemAdmin: boolean }
    ): Promise<AccountRow> {
        const user = await tx.user.update({
            where: { id },
            data: { ...patch, authzVersion: { increment: 1 } },
            select: { id: true, email: true, role: true, isSystemAdmin: true, isBanned: true, deletedAt: true, authzVersion: true },
        });
        return user;
    }

    async insertLog(tx: Prisma.TransactionClient, entry: RoleChangeLogInput): Promise<void> {
        await tx.roleChangeLog.create({ data: entry });
    }
}
