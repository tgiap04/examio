import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@examio/database';

/**
 * AdminManagementService — manual admin user operations.
 *
 * Used by the `bootstrap:admin` CLI subcommands (list / grant / revoke)
 * and any future HTTP admin endpoints. Kept separate from
 * AdminBootstrapService to keep the OnModuleInit sync logic lean
 * and to follow single-responsibility.
 */
@Injectable()
export class AdminManagementService {
    private readonly logger = new Logger(AdminManagementService.name);

    constructor(private readonly prisma: PrismaService) {}

    /**
     * List all current admin users ordered by creation time.
     */
    async listAdmins(): Promise<Array<{
        id: string;
        email: string;
        username: string;
        isAdmin: boolean;
        isVerified: boolean;
        createdAt: Date;
    }>> {
        return this.prisma.user.findMany({
            where: { isAdmin: true },
            select: {
                id: true,
                email: true,
                username: true,
                isAdmin: true,
                isVerified: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'asc' },
        });
    }

    /**
     * Manually grant isAdmin to a single email. Idempotent. Returns
     * the resulting user or null if not found.
     */
    async grantAdmin(email: string): Promise<{
        id: string;
        email: string;
        isAdmin: boolean;
    } | null> {
        const normalized = email.trim().toLowerCase();
        if (!this.isValidEmail(normalized)) {
            throw new Error(`Invalid email: ${email}`);
        }
        const user = await this.prisma.user.findUnique({
            where: { email: normalized },
            select: { id: true, email: true, isAdmin: true },
        });
        if (!user) return null;
        if (user.isAdmin === true) {
            return user;
        }
        const updated = await this.prisma.user.update({
            where: { id: user.id },
            data: { isAdmin: true },
            select: { id: true, email: true, isAdmin: true },
        });
        this.logger.log(
            `Manual grant isAdmin: ${updated.email} (id=${updated.id})`
        );
        return updated;
    }

    /**
     * Manually revoke isAdmin from a single email. Idempotent. Returns
     * the resulting user or null if not found.
     */
    async revokeAdmin(email: string): Promise<{
        id: string;
        email: string;
        isAdmin: boolean;
    } | null> {
        const normalized = email.trim().toLowerCase();
        if (!this.isValidEmail(normalized)) {
            throw new Error(`Invalid email: ${email}`);
        }
        const user = await this.prisma.user.findUnique({
            where: { email: normalized },
            select: { id: true, email: true, isAdmin: true },
        });
        if (!user) return null;
        if (user.isAdmin === false) {
            return user;
        }
        const updated = await this.prisma.user.update({
            where: { id: user.id },
            data: { isAdmin: false },
            select: { id: true, email: true, isAdmin: true },
        });
        this.logger.log(
            `Manual revoke isAdmin: ${updated.email} (id=${updated.id})`
        );
        return updated;
    }

    private isValidEmail(email: string): boolean {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }
}
