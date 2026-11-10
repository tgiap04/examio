import { Injectable } from '@nestjs/common';
import { ownedR2Key } from '@examio/common';
import { OutboxService, R2DeleteTaskWriter } from '@examio/messaging';
import { PrismaService } from '../../prisma';
import { AI_UPLOAD_AREAS, MAX_DELETE_IDS } from '../../config/document.constants';
import { distinctIds } from './distinct-ids';
import { DocumentRepository } from './document.repository';

export interface DeleteResult {
    deleted: Array<{ id: string; filename: string }>;
    notFoundIds: string[];
}

/**
 * The one delete path of `DELETE /ai/upload/:id` and `DeleteDocuments`. One transaction removes the
 * owner's rows, queues their R2 keys in `r2_delete_tasks` and writes the `document.deleted` outbox
 * row; nothing is queued or published when any step fails. Gone or foreign ids are reported, not
 * errors, and a repeat call writes nothing.
 */
@Injectable()
export class DocumentDeleteService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly repo: DocumentRepository,
        private readonly outbox: OutboxService,
        private readonly r2Deletes: R2DeleteTaskWriter
    ) {}

    async deleteOwned(userId: string, ids: string[]): Promise<DeleteResult> {
        const distinct = distinctIds(ids, MAX_DELETE_IDS);
        if (distinct.length === 0) return { deleted: [], notFoundIds: [] };

        return this.prisma.$transaction(async (tx) => {
            const rows = await this.repo.deleteVisible(tx, userId, distinct);
            const found = new Set(rows.map((row) => row.id));
            const notFoundIds = distinct.filter((id) => !found.has(id));
            if (rows.length === 0) return { deleted: [], notFoundIds };

            // Only an object issued to this row's owner is ever deleted; foreign-looking keys stay in R2.
            await this.r2Deletes.enqueue(
                tx,
                rows.map((row) => ownedR2Key(row.keyR2, AI_UPLOAD_AREAS, userId))
            );
            await this.outbox.add(tx, 'document.deleted', { storageIds: rows.map((row) => row.id), userId });
            return { deleted: rows.map((row) => ({ id: row.id, filename: row.filename })), notFoundIds };
        });
    }
}
