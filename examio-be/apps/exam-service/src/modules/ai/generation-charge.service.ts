import { HttpException, Injectable, Logger } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { FinanceClient, buildMetadata } from '@examio/grpc';
import { GenerationJob, Prisma, PrismaService } from '../../prisma';
import {
    chargeForbidden,
    chargeInvalid,
    chargeUnavailable,
    documentErrorCode,
    insufficientCredits,
    isGrpcStatus,
    walletNotFound,
} from '../../clients/document-errors';
import { GenerationJobRepository } from './generation-job.repository';

export type DebitOutcome =
    /** Credits were taken (or the call was a replay / free mode). */
    | { kind: 'charged'; newBalance?: number }
    /** Finance definitively refused (no credits, no wallet, not allowed, malformed): nothing was taken. */
    | { kind: 'refused'; error: HttpException }
    /** The answer was lost (outage, deadline): the debit may or may not have been applied. */
    | { kind: 'unknown'; error: HttpException };

type ChargedJob = Pick<GenerationJob, 'id' | 'userId' | 'chargeKey' | 'chargedAmount'>;

/**
 * The money side of a generation job: ONE `Debit(gen:<jobId>)` as the forwarded user, and the
 * `Refund` of that debit as `svc:exam`. Both are idempotent on the key, so replays never move money
 * twice. `AI_FREE_MODE` (dev only, forced off in production) is honoured here: no finance call at all.
 */
@Injectable()
export class GenerationChargeService {
    private readonly logger = new Logger(GenerationChargeService.name);

    constructor(
        private readonly finance: FinanceClient,
        private readonly jobs: GenerationJobRepository,
        private readonly prisma: PrismaService
    ) {}

    /** Step (2) of the charge flow, as the user (the same token creates a missing wallet for a TEACHER). */
    async debit(job: ChargedJob, reason: string, userToken: string): Promise<DebitOutcome> {
        try {
            const result = await this.finance.debit(
                { userId: job.userId, amount: job.chargedAmount, reason, idempotencyKey: job.chargeKey },
                buildMetadata({ authorization: `Bearer ${userToken}` })
            );
            return { kind: 'charged', newBalance: result.newBalance };
        } catch (error) {
            if (isGrpcStatus(error, status.FAILED_PRECONDITION)) {
                return {
                    kind: 'refused',
                    error: documentErrorCode(error).includes('WALLET_NOT_FOUND') ? walletNotFound() : insufficientCredits(),
                };
            }
            // Also definitive: finance answered "no" (not allowed / malformed), so nothing was taken and the
            // job is failed at once instead of waiting out the 10-minute PENDING_CHARGE park.
            if (isGrpcStatus(error, status.PERMISSION_DENIED)) return { kind: 'refused', error: chargeForbidden() };
            if (isGrpcStatus(error, status.INVALID_ARGUMENT)) return { kind: 'refused', error: chargeInvalid() };
            this.logger.error(`Debit ${job.chargeKey} failed, outcome unknown: ${(error as Error).message}`);
            return { kind: 'unknown', error: chargeUnavailable() };
        }
    }

    /**
     * Reverses the job's debit. Safe to call any number of times and from any path (cancel, failure
     * event, reaper, sweeper): the finance key makes it at most once, and `refundedAt` records that it is
     * settled so no later pass calls finance again. Returns true when the refund is settled.
     *
     * A NOT_FOUND ("never charged") settles only when `settleNotFound` is set, which the reaper does
     * once no debit can still be in flight (past the PENDING_CHARGE timeout or `REFUND_SWEEP_GRACE_MS`):
     * a debit whose request was still in flight when the job was cancelled may land a moment later,
     * and that late debit is refunded by a later pass (or by the request thread).
     */
    async refund(job: ChargedJob, db: PrismaService | Prisma.TransactionClient = this.prisma, settleNotFound = false): Promise<boolean> {
        if (job.chargedAmount <= 0 || this.finance.freeMode) {
            await this.jobs.markRefunded(db, job.id, new Date(), true);
            return true;
        }
        try {
            await this.finance.refund(
                { userId: job.userId, debitIdempotencyKey: job.chargeKey, reason: `Hoàn tín dụng tác vụ AI ${job.id}` },
                buildMetadata()
            );
        } catch (error) {
            if (!isGrpcStatus(error, status.NOT_FOUND)) {
                this.logger.error(`Refund ${job.chargeKey} failed, the sweeper retries: ${(error as Error).message}`);
                return false;
            }
            if (!settleNotFound) return false;
            this.logger.warn(`Job ${job.id}: no debit under ${job.chargeKey}, nothing to refund`);
            await this.jobs.markRefunded(db, job.id, new Date(), true);
            return true;
        }
        await this.jobs.markRefunded(db, job.id);
        return true;
    }
}
