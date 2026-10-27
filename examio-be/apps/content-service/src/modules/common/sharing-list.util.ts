import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../prisma';
import { z } from 'zod';
import type { PrismaService } from '../../prisma';

/** One cap for each list (`whitelist`, `codeGrantedIds`) on every shareable resource. */
export const SHARE_LIST_CAP = 2000;

/** Tables the raw SQL below may touch. The name is interpolated, so it must come from this set. */
export type SharingTable = 'QuizSet' | 'FlashCardSet';
export type CodeGrantTable = SharingTable;
const SHARING_TABLES: ReadonlySet<string> = new Set(['QuizSet', 'FlashCardSet']);
const CODE_GRANT_TABLES: ReadonlySet<string> = SHARING_TABLES;

const userId = z.string().min(1).max(64);

/** Body of `PUT :id/sharing` on quiz sets and flashcard sets: deltas, never a full replace. */
export const SharingDeltaSchema = z
    .object({
        addUserIds: z.array(userId).max(SHARE_LIST_CAP).optional(),
        removeUserIds: z.array(userId).max(SHARE_LIST_CAP).optional(),
        /** Revokes a code unlock ONLY; the user's whitelist grant (if any) stays. */
        removeCodeGrantedIds: z.array(userId).max(SHARE_LIST_CAP).optional(),
        isPublic: z.boolean().optional(),
        codeEnabled: z.boolean().optional(),
    })
    // An old full-replace body ({ accessCode, whitelist }) must fail loudly, not be half-applied.
    .strict()
    .refine(
        (v) =>
            v.addUserIds !== undefined ||
            v.removeUserIds !== undefined ||
            v.removeCodeGrantedIds !== undefined ||
            v.isPublic !== undefined ||
            v.codeEnabled !== undefined,
        { message: 'At least one sharing field is required' }
    );
export type SharingDelta = z.infer<typeof SharingDeltaSchema>;

export class ShareListFullException extends ConflictException {
    constructor() {
        super({
            statusCode: 409,
            code: 'SHARE_LIST_FULL',
            message: `A sharing list holds at most ${SHARE_LIST_CAP} users`,
        });
    }
}

export interface SharingRow {
    isPublic: boolean;
    accessCode: string | null;
    whitelist: string[];
    codeGrantedIds: string[];
}

export interface SharingUpdateInput {
    id: string;
    ownerId: string;
    add: string[];
    /** Removed from the whitelist AND the code-granted list. */
    remove: string[];
    /** Removed from the code-granted list only. */
    removeCodeGranted: string[];
    isPublic?: boolean;
    /** keep = leave the code alone; enable = generate `newCode` if none; disable = null it and evict code users. */
    codeMode: 'keep' | 'enable' | 'disable';
    newCode: string;
}

const table = (name: string, allowed: ReadonlySet<string>): Prisma.Sql => {
    if (!allowed.has(name)) throw new Error(`Unsupported sharing table: ${name}`);
    return Prisma.raw(`"${name}"`);
};

/**
 * ONE `UPDATE ... RETURNING` applies the whole delta, so two teachers' tabs (or
 * a rotate racing an add) can not lose each other's writes: Postgres takes the
 * row lock, and the second statement re-evaluates against the committed row.
 * `remove` also evicts the user from `codeGrantedIds`. The cap is checked on
 * the NEW row inside the transaction; throwing there rolls the update back.
 */
export async function applySharingUpdate(
    prisma: PrismaService,
    name: SharingTable,
    input: SharingUpdateInput
): Promise<SharingRow> {
    const tbl = table(name, SHARING_TABLES);
    const { id, ownerId, add, remove, removeCodeGranted, isPublic, codeMode, newCode } = input;
    return prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<Array<SharingRow & { n: number }>>(Prisma.sql`
            UPDATE ${tbl} SET
                "isPublic" = COALESCE(${isPublic ?? null}::boolean, "isPublic"),
                "accessCode" = CASE ${codeMode}::text
                    WHEN 'enable' THEN COALESCE("accessCode", ${newCode}::text)
                    WHEN 'disable' THEN NULL
                    ELSE "accessCode" END,
                "whitelist" = ARRAY(
                    SELECT t.u FROM unnest(array_cat(COALESCE("whitelist", '{}'), ${add}::text[]))
                        WITH ORDINALITY AS t(u, ord)
                    WHERE t.u <> ALL(${remove}::text[])
                    GROUP BY t.u ORDER BY min(t.ord)),
                "codeGrantedIds" = CASE WHEN ${codeMode}::text = 'disable' THEN ARRAY[]::text[]
                    ELSE ARRAY(SELECT u FROM unnest(COALESCE("codeGrantedIds", '{}')) AS u
                               WHERE u <> ALL(${remove}::text[])
                                 AND u <> ALL(${removeCodeGranted}::text[])) END,
                "updatedAt" = now()
            WHERE "id" = ${id} AND "userId" = ${ownerId}
            RETURNING "isPublic", "accessCode", "whitelist", "codeGrantedIds",
                      cardinality("whitelist")::int AS n`);
        const row = rows[0];
        if (!row) throw new NotFoundException('Resource not found');
        if (row.n > SHARE_LIST_CAP) throw new ShareListFullException();
        const { n: _n, ...view } = row;
        return view;
    });
}

async function codeGrantedOf(
    prisma: PrismaService,
    name: CodeGrantTable,
    id: string
): Promise<string[] | null> {
    const select = { codeGrantedIds: true } as const;
    const row =
        name === 'QuizSet'
            ? await prisma.quizSet.findFirst({ where: { id }, select })
            : await prisma.flashCardSet.findFirst({ where: { id }, select });
    return row ? row.codeGrantedIds : null;
}

const appendOnce = (
    prisma: PrismaService,
    tbl: Prisma.Sql,
    id: string,
    user: string,
    code: string | undefined
): Promise<number> =>
    prisma.$executeRaw(Prisma.sql`
        UPDATE ${tbl} SET "codeGrantedIds" = array_append(COALESCE("codeGrantedIds", '{}'), ${user}::text)
        WHERE "id" = ${id}
          AND (${code ?? null}::text IS NULL OR "accessCode" = ${code ?? null}::text)
          AND NOT (${user}::text = ANY(COALESCE("codeGrantedIds", '{}')))
          AND cardinality(COALESCE("codeGrantedIds", '{}')) < ${SHARE_LIST_CAP}`);

/**
 * Remember that `user` unlocked the current code. Atomic and idempotent: the
 * `WHERE` rejects a present user and a full list, so two parallel unlocks add
 * the id once. `expectedCode` (the code that was just verified) must still be
 * the stored one, so a rotation between the check and the write can not grant
 * access with the old code. 0 rows = already present (ok), full (409), gone (404).
 */
export async function appendCodeGranted(
    prisma: PrismaService,
    name: CodeGrantTable,
    id: string,
    user: string,
    expectedCode?: string
): Promise<void> {
    const tbl = table(name, CODE_GRANT_TABLES);
    // A second pass only matters when a rotate cleared the list between the update and the re-read.
    for (let pass = 0; pass < 2; pass++) {
        if ((await appendOnce(prisma, tbl, id, user, expectedCode)) > 0) return;
        const current = await codeGrantedOf(prisma, name, id);
        if (current === null) throw new NotFoundException('Resource not found');
        if (current.includes(user)) return;
        if (current.length >= SHARE_LIST_CAP) throw new ShareListFullException();
    }
    throw new ConflictException({
        statusCode: 409,
        code: 'SHARING_CHANGED',
        message: 'Sharing settings changed, try again',
    });
}
