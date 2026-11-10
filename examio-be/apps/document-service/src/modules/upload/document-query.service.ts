import { Injectable } from '@nestjs/common';
import { PrismaService, UserStorage } from '../../prisma';
import { DocumentFinance } from '../../clients/document-finance.service';
import { MAX_QUERY_IDS } from '../../config/document.constants';
import { distinctIds } from './distinct-ids';
import { DocumentErrorCode, documentError } from './document-errors';
import { DocumentRepository } from './document.repository';

export interface Quota {
    usedThisMonth: number;
    /** -1 = unlimited. */
    monthlyLimit: number;
    fileCount: number;
}

const notFound = () => documentError(404, DocumentErrorCode.NOT_FOUND, 'Upload không tồn tại');

/** Owner-scoped reads and the monthly quota. A row of another user is a 404, never a 403. */
@Injectable()
export class DocumentQueryService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly repo: DocumentRepository,
        private readonly finance: DocumentFinance
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
        const [monthlyLimit, usedThisMonth, fileCount] = await Promise.all([
            this.finance.filesPerMonth(userId),
            this.repo.countSince(userId, startOfMonth()),
            this.repo.countAll(userId),
        ]);
        return { usedThisMonth, monthlyLimit, fileCount };
    }

    /** 403 once the plan's `filesPerMonth` is spent (-1 = unlimited); run before anything expensive. */
    async enforceQuota(userId: string): Promise<void> {
        const limit = await this.finance.filesPerMonth(userId);
        if (limit === -1) return;
        const used = await this.repo.countSince(userId, startOfMonth());
        if (used >= limit) {
            throw documentError(
                403,
                DocumentErrorCode.QUOTA_EXCEEDED,
                `Bạn đã đạt giới hạn ${limit} file/tháng. Vui lòng nâng cấp gói hoặc thử lại vào tháng sau.`
            );
        }
    }
}

function startOfMonth(now = new Date()): Date {
    return new Date(now.getFullYear(), now.getMonth(), 1);
}
