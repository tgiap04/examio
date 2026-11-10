import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { isForeignR2Url, ownedR2KeyFromUrl } from '@kmaedu/common';
import { R2DeleteTaskWriter } from '@kmaedu/messaging';
import type { Prisma, User } from '../prisma';
import { PrismaService } from '../prisma';
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

/** R2 area of each image field; keys are `<area>/<userId>/<random>-<name>` (see ProfileService). */
const IMAGE_AREA = { avatar: 'avatars', banner: 'banners' } as const;
type ImageField = keyof typeof IMAGE_AREA;

/**
 * The one place that writes profile fields of a `User`: the row update and the
 * `auth.user.updated` outbox event commit together (with the R2 cleanup tasks of
 * a replaced avatar/banner), then the cached views of the user are dropped. Fields whose value did not change are not written and
 * produce no event.
 */
@Injectable()
export class UserUpdateWriter {
    private readonly logger = new Logger(UserUpdateWriter.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly users: UserRepository,
        private readonly publisher: UserUpdatedPublisher,
        private readonly r2Deletes: R2DeleteTaskWriter
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

            // A client-supplied avatar/banner may only point at an object this user
            // uploaded (or an external URL): never at someone else's R2 object, which
            // a later replace would otherwise queue for deletion.
            for (const key of entries) {
                if (key !== 'avatar' && key !== 'banner') continue;
                const next = patch[key];
                if (typeof next === 'string' && isForeignR2Url(next, [IMAGE_AREA[key]], userId)) {
                    throw new BadRequestException(`Giá trị ${key} không hợp lệ`);
                }
            }

            const data: Prisma.UserUncheckedUpdateInput = { updatedBy: actorId };
            for (const key of entries) (data as Record<string, unknown>)[key] = patch[key];
            const updated = await tx.user.update({ where: { id: userId }, data });
            const changed = entries.map((key) => FIELD_NAMES[key]);
            await this.publisher.publish(tx, updated, changed);
            // A replaced avatar/banner object is queued with the row update (same tx),
            // only when it is under this user's own prefix and no field of the row
            // still points at it. Legacy owner-less keys stay in R2 (accepted orphan).
            await this.r2Deletes.enqueue(
                tx,
                entries
                    .filter((key): key is ImageField => key === 'avatar' || key === 'banner')
                    .map((key) => this.deletableKey(existing, updated, key, userId))
            );
            return { user: updated, changed };
        });
        if (result && result.changed.length > 0) await this.users.invalidateCaches(result.user);
        return result;
    }

    private deletableKey(
        before: User,
        after: User,
        field: ImageField,
        userId: string
    ): string | null {
        const url = before[field];
        const key = ownedR2KeyFromUrl(url, [IMAGE_AREA[field]], userId);
        if (!key) {
            if (url) this.logger.log(`Not deleting ${field} object outside ${userId}'s prefix`);
            return null;
        }
        const stillUsed = (['avatar', 'banner'] as const).some((f) => after[f] === url);
        return stillUsed ? null : key;
    }
}
