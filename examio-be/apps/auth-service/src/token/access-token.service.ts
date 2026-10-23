import {
    Injectable,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common';
import type { Prisma, User } from '../prisma';
import { PrismaService } from '../prisma';
import { permissionsOf, rolesFor, type Permission, type Role } from '@examio/auth-jwt';
import { TokenService } from './token.service';

/** 401 `ACCOUNT_DISABLED`: the caller must deactivate the session it just used. */
export class AccountDisabledException extends UnauthorizedException {
    constructor() {
        super({
            statusCode: 401,
            code: 'ACCOUNT_DISABLED',
            message: 'Account is disabled',
        });
    }
}

export interface IssuedAccessToken {
    token: string;
    user: User;
    roles: Role[];
    permissions: Permission[];
}

/**
 * Signs an access token INSIDE a transaction that holds `FOR SHARE` on the
 * user row: a role change (which needs `FOR UPDATE` on the same row) either
 * commits before the read (token carries the new roles + new `av`) or waits
 * until the token is signed (old roles + old `av`). Never a mix.
 */
@Injectable()
export class AccessTokenService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly tokens: TokenService
    ) {}

    issue(
        userId: string,
        sessionId: string,
        include?: Prisma.UserInclude
    ): Promise<IssuedAccessToken> {
        return this.prisma.$transaction(
            async (tx) => {
                const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "User" WHERE id = ${userId} FOR SHARE`;
                if (locked.length === 0) throw new NotFoundException('User not found');

                const user = await tx.user.findUnique({ where: { id: userId }, include });
                if (!user) throw new NotFoundException('User not found');
                if (user.isBanned || user.deletedAt) throw new AccountDisabledException();

                const roles = rolesFor(user.role, user.isSystemAdmin);
                const { token } = await this.tokens.signUserToken({
                    userId: user.id,
                    sessionId,
                    roles,
                    emailVerified: user.isVerified,
                    authzVersion: user.authzVersion,
                });
                return { token, user, roles, permissions: permissionsOf(roles) };
            },
            { maxWait: 5000, timeout: 10000 }
        );
    }
}
