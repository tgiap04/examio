import { Injectable } from '@nestjs/common';
import type { Prisma, User } from '@prisma/client';
import { PrismaService } from '@examio/database';
import { UserRepository } from '../repositories/user.repository';
import { UserChangedField, UserUpdatedPublisher } from './user-updated.publisher';

export type UserProfilePatch = Partial<
    Pick<Prisma.UserUncheckedUpdateInput, 'name' | 'bio' | 'avatar' | 'banner' | 'isVerified'>
>;

const FIELD_NAMES: Record<keyof UserProfilePatch, UserChangedField> = {
    name: 'name',
    bio: 'bio',
    avatar: 'avatar',
    banner: 'banner',
    isVerified: 'is_verified',
};

/**
 * The one place that writes profile fields of a `User`: the row update and the
 * `auth.user.updated` outbox event commit together, then the cached views of
 * the user are dropped. Fields whose value did not change are not written and
 * produce no event.
 */
@Injectable()
export class UserUpdateWriter {
    constructor(
        private readonly prisma: PrismaService,
        private readonly users: UserRepository,
        private readonly publisher: UserUpdatedPublisher
    ) {}

    /** Returns null when the user does not exist. */
    async update(
        userId: string,
        patch: UserProfilePatch,
        actorId: string
    ): Promise<{ user: User; changed: UserChangedField[] } | null> {
        const result = await this.prisma.$transaction(async (tx) => {
            const existing = await tx.user.findUnique({ where: { id: userId } });
            if (!existing) return null;

            const entries = (Object.keys(patch) as Array<keyof UserProfilePatch>).filter(
                (key) => patch[key] !== undefined && patch[key] !== existing[key]
            );
            if (entries.length === 0) return { user: existing, changed: [] };

            const data: Prisma.UserUncheckedUpdateInput = { updatedBy: actorId };
            for (const key of entries) (data as Record<string, unknown>)[key] = patch[key];
            const updated = await tx.user.update({ where: { id: userId }, data });
            const changed = entries.map((key) => FIELD_NAMES[key]);
            await this.publisher.publish(tx, updated, changed);
            return { user: updated, changed };
        });
        if (result && result.changed.length > 0) await this.users.invalidateCaches(result.user);
        return result;
    }
}
