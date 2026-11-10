import { Injectable } from '@nestjs/common';
import { PrismaService, UserStorage } from '../../prisma';
import { MAX_QUERY_IDS } from '../../config/document.constants';
import { distinctIds } from './distinct-ids';
import { DocumentErrorCode, documentError } from './document-errors';
import { DocumentRepository } from './document.repository';

/** Upload counts of a user (dashboard stats); there is no monthly limit. */
export interface Quota {
    usedThisMonth: number;
    fileCount: number;
}

const notFound = () => documentError(404, DocumentErrorCode.NOT_FOUND, 'Upload không tồn tại');

/** Owner-scoped reads and upload counts. A row of another user is a 404, never a 403. */
@Injectable()
export class DocumentQueryService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly repo: DocumentRepository
    ) {}

    async getOwned(userId: string, id: string): Promise<UserStorage> {
        const row = await this.repo.findVisible(userId, id);
        if (!row) throw notFound();
        return row;
    }

    listRecent(userId: string, page: number, size: number): Promise<UserStorage[]> {
        return this.repo.listVisible(userId, page, size);
    }

    /** Caller-owned rows only; ids that are missing or foreign are simply absent. */
    async getByIds(userId: string, ids: string[]): Promise<UserStorage[]> {
        const distinct = distinctIds(ids, MAX_QUERY_IDS);
        return distinct.length === 0 ? [] : this.repo.findVisibleByIds(this.prisma, userId, distinct);
    }

    /** 404 when ANY id is not owned by the caller. */
    async assertOwnership(userId: string, ids: string[]): Promise<void> {
        const distinct = distinctIds(ids, MAX_QUERY_IDS);
        if (distinct.length === 0) return;
        const owned = await this.repo.findVisibleByIds(this.prisma, userId, distinct);
        if (owned.length !== distinct.length) throw notFound();
    }

    async getQuota(userId: string): Promise<Quota> {
        const [usedThisMonth, fileCount] = await Promise.all([
            this.repo.countSince(userId, startOfMonth()),
            this.repo.countAll(userId),
        ]);
        return { usedThisMonth, fileCount };
    }
}

function startOfMonth(now = new Date()): Date {
    return new Date(now.getFullYear(), now.getMonth(), 1);
}
