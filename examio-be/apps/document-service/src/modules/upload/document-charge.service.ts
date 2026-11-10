import { Injectable, Logger } from '@nestjs/common';
import { ownedR2Key } from '@examio/common';
import { OutboxService, R2DeleteTaskWriter } from '@examio/messaging';
import { Prisma, PrismaService, UserStorage } from '../../prisma';
import { R2Client } from '../../clients/r2.client';
import { ChargeFailedError, DocumentFinance } from '../../clients/document-finance.service';
import {
    AI_UPLOAD_AREAS,
    DOWNLOAD_URL_TTL_SECONDS,
    DocumentStatus,
    docChargeKey,
    uploadCredits,
} from '../../config/document.constants';
import { DocumentErrorCode, documentError } from './document-errors';
import { DocumentRepository } from './document.repository';

export interface ChargeResult {
    newBalance?: number;
}

/**
 * The charge-first upload flow. A row is inserted as PENDING_CHARGE (committed), then
 * `Debit(doc:<id>)` runs, then one conditional tx moves it to PENDING and writes the
 * `document.uploaded` outbox row. A crash in between leaves PENDING_CHARGE, which the reaper
 * settles (claim FAILED + R2 key queued, then refund). The key is bound to the storage id, so a client
 * retry or a replayed RPC can never debit twice. Compensation is claim-then-refund with bookkeeping
 * (`refundSettledAt`), like exam's generation jobs: only a definitive refusal settles at once.
 */
@Injectable()
export class DocumentChargeService {
    private readonly logger = new Logger(DocumentChargeService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly repo: DocumentRepository,
        private readonly finance: DocumentFinance,
        private readonly r2: R2Client,
        private readonly outbox: OutboxService,
        private readonly r2Deletes: R2DeleteTaskWriter
    ) {}

    /** Presigned GET handed to ai-service (valid 1 h); throws 503 when r2 cannot sign. */
    async downloadUrl(doc: Pick<UserStorage, 'keyR2'>): Promise<string> {
        try {
            return await this.r2.createPresignedDownload(doc.keyR2, DOWNLOAD_URL_TTL_SECONDS);
        } catch (error) {
            this.logger.error(`Presigned download failed: ${(error as Error).message}`);
            throw documentError(503, DocumentErrorCode.STORAGE_UNAVAILABLE, 'Không thể truy cập kho lưu trữ lúc này.');
        }
    }

    /** `document.uploaded` in the caller's transaction (the caller stamps `queuedAt` in the same tx). */
    async recordUploaded(tx: Prisma.TransactionClient, doc: UserStorage, downloadUrl: string): Promise<void> {
        await this.outbox.add(tx, 'document.uploaded', {
            storageId: doc.id,
            userId: doc.userId,
            filename: doc.filename,
            mimetype: doc.mimetype,
            downloadUrl,
        });
    }

    /** Steps 2 and 3 for a committed PENDING_CHARGE row. Throws the HTTP-shaped error on refusal. */
    async chargeAndQueue(doc: UserStorage, userToken?: string): Promise<ChargeResult> {
        const credits = uploadCredits(doc.size);
        let downloadUrl: string;
        try {
            // Before any money moves: an r2 outage then costs the user nothing.
            downloadUrl = await this.downloadUrl(doc);
        } catch (error) {
            await this.failQuietly(doc, false);
            throw error;
        }

        let newBalance: number | undefined;
        if (credits > 0) {
            try {
                const sizeMb = (doc.size / (1024 * 1024)).toFixed(2);
                ({ newBalance } = await this.finance.debit(
                    doc.userId,
                    credits,
                    `Upload file: ${doc.filename} (${sizeMb} MB)`,
                    docChargeKey(doc.id),
                    userToken
                ));
            } catch (error) {
                if (!(error instanceof ChargeFailedError)) throw error;
                if (await this.failAfterRefusedCharge(doc, error)) throw error.httpError;
                // Someone else moved the row: a concurrent identical request confirmed it, which is a success.
                return { newBalance };
            }
        }

        const queued = await this.prisma.$transaction(async (tx) => {
            if (!(await this.repo.confirmCharge(tx, doc.id, credits > 0))) return false;
            await this.recordUploaded(tx, doc, downloadUrl);
            return true;
        });
        if (queued) return { newBalance };

        // 0 rows: someone else moved the row. A concurrent identical request that won is success.
        const current = await this.repo.findRaw(this.prisma, doc.id);
        if (current && current.chargeFailedAt === null && current.processingStatus !== DocumentStatus.PENDING_CHARGE) {
            return { newBalance };
        }
        // The reaper failed the row first and owns its refund (claim-then-refund): nothing to compensate here.
        throw documentError(409, DocumentErrorCode.UPLOAD_EXPIRED, 'Upload đã hết hạn, vui lòng thử lại.');
    }

    /**
     * Claims the row as FAILED after a refused debit. Returns true when the caller must answer the
     * refusal; false when the row had already left PENDING_CHARGE and was confirmed by a concurrent
     * request (its charge is legitimate and must NOT be refunded).
     *
     * A definitive refusal owes nothing. An ambiguous one (the answer was lost) claims FIRST and only then
     * refunds, so a refund can never hit a row someone else confirmed; a Refund NOT_FOUND does not settle
     * it yet (the debit may still commit): the reaper retries past `REFUND_SWEEP_GRACE_MS`.
     */
    private async failAfterRefusedCharge(doc: UserStorage, error: ChargeFailedError): Promise<boolean> {
        const refundOwed = !error.definitive;
        let claimed: boolean;
        try {
            claimed = await this.claimFailed(doc, refundOwed);
        } catch (claimError) {
            // The row stays PENDING_CHARGE; the reaper claims it after 10 minutes and refunds then.
            this.logger.warn(`Could not claim ${doc.id} now, reaper will: ${(claimError as Error).message}`);
            return true;
        }
        if (!claimed) {
            const current = await this.repo.findRaw(this.prisma, doc.id);
            return !(current && current.chargeFailedAt === null && current.processingStatus !== DocumentStatus.PENDING_CHARGE);
        }
        if (refundOwed) await this.settleRefund(doc, false);
        return true;
    }

    /**
     * PENDING_CHARGE -> FAILED + `chargeFailedAt`, with its R2 key queued, in ONE tx. False when the row
     * was already moved. `refundOwed` false marks the refund as settled in the same statement.
     */
    async claimFailed(doc: UserStorage, refundOwed: boolean, now = new Date()): Promise<boolean> {
        return this.prisma.$transaction(async (tx) => {
            if (!(await this.repo.claimFailed(tx, doc.id, now, refundOwed))) return false;
            await this.r2Deletes.enqueue(tx, [ownedR2Key(doc.keyR2, AI_UPLOAD_AREAS, doc.userId)]);
            return true;
        });
    }

    /** Reaper: a row stuck in PENDING_CHARGE for 10 minutes is claimed, then refunded (no debit can still be in flight). */
    async failStuck(doc: UserStorage, now = new Date()): Promise<boolean> {
        if (!(await this.claimFailed(doc, true, now))) return false;
        await this.settleRefund(doc, true, now);
        return true;
    }

    /**
     * Runs the compensating `Refund(doc:<id>)` of a claimed row and records it in `refundSettledAt`.
     * An applied refund settles at once; NOT_FOUND ("never charged") only with `settleNotFound`; any other
     * failure leaves it open for the reaper. Never throws. Returns true when the refund is settled.
     */
    async settleRefund(doc: UserStorage, settleNotFound: boolean, now = new Date()): Promise<boolean> {
        try {
            // Free mode never debits, so nothing is owed.
            if (!this.finance.freeMode) {
                const applied = await this.finance.refund(doc.userId, docChargeKey(doc.id), 'Upload failed before it was queued');
                if (!applied && !settleNotFound) return false;
            }
            await this.repo.markRefundSettled(this.prisma, doc.id, now);
            return true;
        } catch (error) {
            this.logger.warn(`Refund of ${doc.id} deferred, the reaper retries: ${(error as Error).message}`);
            return false;
        }
    }

    private async failQuietly(doc: UserStorage, refundOwed: boolean): Promise<void> {
        try {
            await this.claimFailed(doc, refundOwed);
        } catch (error) {
            // The row stays PENDING_CHARGE; the reaper settles it.
            this.logger.warn(`Could not settle ${doc.id} now, reaper will: ${(error as Error).message}`);
        }
    }
}
