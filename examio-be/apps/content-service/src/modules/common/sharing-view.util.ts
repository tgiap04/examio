import type { Metadata } from '@grpc/grpc-js';
import type { ProfileLookupOptions, PublicUser } from '../../clients/auth.client';
import type { SharingDelta, SharingRow, SharingUpdateInput } from './sharing-list.util';

export type SharingPerson = PublicUser;

/** The slice of `UserEnricher` the sharing helpers need (auth owns user data). */
export interface ProfileLookup {
    profileMap(
        ids: string[],
        metadata?: Metadata,
        options?: ProfileLookupOptions
    ): Promise<Map<string, PublicUser>>;
}

export interface SharingView {
    isPublic: boolean;
    accessCode: string | null;
    whitelist: SharingPerson[];
    codeGranted: SharingPerson[];
}

/** Owner-facing view: ONE batch lookup for both lists, people without email. */
export async function toSharingView(
    users: ProfileLookup,
    row: SharingRow
): Promise<SharingView> {
    const wanted = [...new Set([...row.whitelist, ...row.codeGrantedIds])];
    const byId = wanted.length
        ? await users.profileMap(wanted)
        : new Map<string, PublicUser>();
    const pick = (list: string[]): SharingPerson[] =>
        list.flatMap((id) => {
            const p = byId.get(id);
            return p
                ? [{ id: p.id, username: p.username, name: p.name, avatar: p.avatar }]
                : [];
        });
    return {
        isPublic: row.isPublic,
        accessCode: row.accessCode,
        whitelist: pick(row.whitelist),
        codeGranted: pick(row.codeGrantedIds),
    };
}

/**
 * Ids from `ids` that belong to a live account (keeps junk ids out of the
 * capped list). Strict: an unreachable auth is a 503, never "no such users".
 */
export async function existingUserIds(
    users: ProfileLookup,
    ids: string[]
): Promise<string[]> {
    if (ids.length === 0) return [];
    const known = await users.profileMap(ids, undefined, { strict: true });
    return ids.filter((id) => known.has(id));
}

/**
 * Request delta -> statement input: new ids are limited to live accounts (junk
 * ids would only eat the capped list) and never include the owner.
 */
export async function prepareSharingUpdate(
    users: ProfileLookup,
    id: string,
    ownerId: string,
    dto: SharingDelta,
    newCode: string
): Promise<SharingUpdateInput> {
    const add = (await existingUserIds(users, dto.addUserIds ?? [])).filter(
        (uid) => uid !== ownerId
    );
    return {
        id,
        ownerId,
        add,
        remove: dto.removeUserIds ?? [],
        removeCodeGranted: dto.removeCodeGrantedIds ?? [],
        isPublic: dto.isPublic,
        codeMode:
            dto.codeEnabled === undefined ? 'keep' : dto.codeEnabled ? 'enable' : 'disable',
        newCode,
    };
}
