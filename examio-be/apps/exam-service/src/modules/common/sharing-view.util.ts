import type { PrismaService } from '@examio/database';
import type { SharingDelta, SharingRow, SharingUpdateInput } from './sharing-list.util';

export interface SharingPerson {
    id: string;
    username: string;
    name: string | null;
    avatar: string | null;
}

export interface SharingView {
    isPublic: boolean;
    accessCode: string | null;
    whitelist: SharingPerson[];
    codeGranted: SharingPerson[];
}

/** Owner-facing view: ONE batch lookup for both lists, people without email. */
export async function toSharingView(
    prisma: PrismaService,
    row: SharingRow
): Promise<SharingView> {
    const wanted = [...new Set([...row.whitelist, ...row.codeGrantedIds])];
    const people = wanted.length
        ? await prisma.user.findMany({
              where: { id: { in: wanted } },
              select: { id: true, username: true, name: true, avatar: true },
          })
        : [];
    const byId = new Map(people.map((p) => [p.id, p]));
    const pick = (list: string[]): SharingPerson[] =>
        list.flatMap((id) => {
            const p = byId.get(id);
            return p ? [p] : [];
        });
    return {
        isPublic: row.isPublic,
        accessCode: row.accessCode,
        whitelist: pick(row.whitelist),
        codeGranted: pick(row.codeGrantedIds),
    };
}

/** Ids from `ids` that belong to a live account (keeps junk ids out of the capped list). */
export async function existingUserIds(
    prisma: PrismaService,
    ids: string[]
): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await prisma.user.findMany({
        where: { id: { in: ids }, deletedAt: null },
        select: { id: true },
    });
    return rows.map((r) => r.id);
}

/**
 * Request delta -> statement input: new ids are limited to live accounts (junk
 * ids would only eat the capped list) and never include the owner.
 */
export async function prepareSharingUpdate(
    prisma: PrismaService,
    id: string,
    ownerId: string,
    dto: SharingDelta,
    newCode: string
): Promise<SharingUpdateInput> {
    const add = (await existingUserIds(prisma, dto.addUserIds ?? [])).filter(
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
