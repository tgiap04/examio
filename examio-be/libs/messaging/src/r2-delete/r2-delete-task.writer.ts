import { Injectable } from '@nestjs/common';

/** Structural slice of a Prisma tx client: keeps this lib Prisma-free. */
export interface R2DeleteTx {
    $executeRaw(strings: TemplateStringsArray, ...values: unknown[]): PromiseLike<unknown>;
}

/** Normalises caller input: drops empty values and duplicates, keeps order. */
export function normalizeR2Keys(keys: ReadonlyArray<string | null | undefined>): string[] {
    const seen = new Set<string>();
    for (const key of keys) {
        const trimmed = key?.trim();
        if (trimmed) seen.add(trimmed);
    }
    return [...seen];
}

/**
 * Queues R2 objects for deletion in the caller's own transaction: the tasks
 * exist if and only if the row delete / image replace commits. Nothing here
 * talks to R2; `R2DeleteWorker` drains the table.
 */
@Injectable()
export class R2DeleteTaskWriter {
    /** Returns how many distinct keys were queued. */
    async enqueue(
        tx: R2DeleteTx,
        keys: ReadonlyArray<string | null | undefined>
    ): Promise<number> {
        const distinct = normalizeR2Keys(keys);
        if (distinct.length === 0) return 0;
        // `id` has no DB default (Prisma generates uuids client-side), so it is set here.
        await tx.$executeRaw`
            INSERT INTO r2_delete_tasks (id, key)
            SELECT gen_random_uuid(), k FROM unnest(${distinct}::text[]) AS k`;
        return distinct.length;
    }
}
