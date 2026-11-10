import { Injectable } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import type { Prisma, WalletTransaction } from '../../prisma';
import { GenerateIdService, invalidateWalletCachesBestEffort } from '@examio/common';
import { PrismaService } from '../../prisma';
import { RedisService } from '@examio/redis';
import { EnsureWalletService } from './ensure-wallet.service';

/** WalletTransaction.type values (see payment.prisma). */
const TYPE_BUY_CREDITS = 0;
const TYPE_REFUND = 2;
const TYPE_ADMIN_ADJUSTMENT = 3;
const TYPE_USE_SERVICES = 4;

const INT32_MAX = 2_147_483_647;

export interface MoneyRequest {
    userId: string;
    amount: number;
    reason: string;
    idempotencyKey: string;
}

export interface RefundRequest {
    userId: string;
    debitIdempotencyKey: string;
    reason: string;
}

export interface DebitOptions {
    /** Mint the welcome wallet when missing (only for a verified TEACHER caller). */
    createWallet?: boolean;
}

/** Ledger key namespaces: a raw caller key never collides across operations. */
const DEBIT_KEY = 'debit:';
const CREDIT_KEY = 'credit:';

export interface MoneyResult {
    transaction: WalletTransaction;
    alreadyApplied: boolean;
}

interface Posting {
    userId: string;
    amount: number;
    direction: 'ADD' | 'SUBTRACT';
    type: number;
    description: string;
    idempotencyKey: string;
    /** Debit only: create the wallet (welcome credits) when it is missing. */
    ensureWallet: boolean;
    /** Ledger `createdBy`/`updatedBy`; admin writes pass the token subject. */
    actor?: string;
}

export const rpcError = (code: number, message: string): RpcException =>
    new RpcException({ code, message });

export function assertWholeCredits(amount: number): void {
    if (!Number.isInteger(amount) || amount <= 0 || amount > INT32_MAX) {
        throw rpcError(status.INVALID_ARGUMENT, 'INVALID_AMOUNT');
    }
}

export function assertIdempotencyKey(key: string): void {
    if (typeof key !== 'string' || key.trim() === '' || key.length > 200) {
        throw rpcError(status.INVALID_ARGUMENT, 'IDEMPOTENCY_KEY_REQUIRED');
    }
}

/**
 * Idempotent money movement. One transaction per call: INSERT the ledger row
 * `ON CONFLICT (walletId, idempotencyKey) DO NOTHING`; when a row was
 * inserted adjust the balance (a SUBTRACT is guarded by `balance >= amount`,
 * 0 rows rolls the insert back), otherwise return the stored row with
 * `alreadyApplied = true`. Concurrent same-key calls serialize on the unique
 * index, so exactly one of them applies.
 */
@Injectable()
export class WalletMoneyService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly ids: GenerateIdService,
        private readonly redis: RedisService,
        private readonly ensureWallet: EnsureWalletService
    ) {}

    async debit(req: MoneyRequest, opts: DebitOptions = {}): Promise<MoneyResult> {
        assertIdempotencyKey(req.idempotencyKey);
        return this.post({
            userId: req.userId,
            amount: req.amount,
            direction: 'SUBTRACT',
            type: TYPE_USE_SERVICES,
            description: req.reason,
            idempotencyKey: `${DEBIT_KEY}${req.idempotencyKey}`,
            ensureWallet: opts.createWallet === true,
        });
    }

    async credit(req: MoneyRequest): Promise<MoneyResult> {
        assertIdempotencyKey(req.idempotencyKey);
        return this.post({
            userId: req.userId,
            amount: req.amount,
            direction: 'ADD',
            type: TYPE_BUY_CREDITS,
            description: req.reason,
            idempotencyKey: `${CREDIT_KEY}${req.idempotencyKey}`,
            ensureWallet: false,
        });
    }

    /** Admin adjustment (type 3); the actor is the forwarded admin token subject. */
    async adjust(
        req: Omit<MoneyRequest, 'idempotencyKey'> & {
            direction: 'ADD' | 'SUBTRACT';
            idempotencyKey: string;
        },
        actor: string
    ): Promise<MoneyResult> {
        assertIdempotencyKey(req.idempotencyKey);
        return this.post({
            userId: req.userId,
            amount: req.amount,
            direction: req.direction,
            type: TYPE_ADMIN_ADJUSTMENT,
            description: `Admin adjustment: ${req.reason}`,
            idempotencyKey: `adjust:${req.idempotencyKey}`,
            ensureWallet: false,
            actor,
        });
    }

    /** Reverses the debit stored under `debitIdempotencyKey`, at most once. */
    async refund(req: RefundRequest): Promise<MoneyResult> {
        assertIdempotencyKey(req.debitIdempotencyKey);
        if (!req.userId) throw rpcError(status.INVALID_ARGUMENT, 'USER_ID_REQUIRED');
        const debit = await this.prisma.walletTransaction.findFirst({
            where: {
                idempotencyKey: `${DEBIT_KEY}${req.debitIdempotencyKey}`,
                direction: 'SUBTRACT',
                wallet: { userId: req.userId },
            },
        });
        if (!debit) throw rpcError(status.NOT_FOUND, 'DEBIT_NOT_FOUND');
        return this.post({
            userId: req.userId,
            amount: debit.amount,
            direction: 'ADD',
            type: TYPE_REFUND,
            description: req.reason || `Refund of ${req.debitIdempotencyKey}`,
            idempotencyKey: `refund:${req.debitIdempotencyKey}`,
            ensureWallet: false,
        });
    }

    private async post(p: Posting): Promise<MoneyResult> {
        assertWholeCredits(p.amount);
        assertIdempotencyKey(p.idempotencyKey);
        if (!p.userId) throw rpcError(status.INVALID_ARGUMENT, 'USER_ID_REQUIRED');

        const result = await this.prisma.$transaction(async (tx) => {
            if (p.ensureWallet) await this.ensureWallet.ensure(p.userId, tx);
            const wallet = await tx.wallet.findUnique({ where: { userId: p.userId } });
            if (!wallet) {
                throw rpcError(
                    p.direction === 'SUBTRACT' && p.type === TYPE_USE_SERVICES
                        ? status.FAILED_PRECONDITION
                        : status.NOT_FOUND,
                    'WALLET_NOT_FOUND'
                );
            }
            return { walletId: wallet.id, ...(await this.apply(tx, wallet.id, p)) };
        });

        if (!result.alreadyApplied) {
            await invalidateWalletCachesBestEffort(this.redis, p.userId, result.walletId);
        }
        return { transaction: result.transaction, alreadyApplied: result.alreadyApplied };
    }

    private async apply(
        tx: Prisma.TransactionClient,
        walletId: string,
        p: Posting
    ): Promise<MoneyResult> {
        const txId = this.ids.generateId();
        const inserted = await tx.$queryRaw<Array<{ id: string }>>`
            INSERT INTO "WalletTransaction"
                (id, "walletId", amount, type, direction, description, "idempotencyKey", "createdBy", "updatedBy", "updatedAt")
            VALUES (${txId}, ${walletId}, ${p.amount}, ${p.type}, ${p.direction}, ${p.description},
                    ${p.idempotencyKey}, ${p.actor ?? 'MONEY_RPC'}, ${p.actor ?? null}, now())
            ON CONFLICT ("walletId", "idempotencyKey") DO NOTHING
            RETURNING id`;

        if (inserted.length === 0) {
            const existing = await tx.walletTransaction.findFirstOrThrow({
                where: { walletId, idempotencyKey: p.idempotencyKey },
            });
            // Same key, different request: refuse instead of answering with an unrelated row.
            if (
                existing.direction !== p.direction ||
                existing.type !== p.type ||
                existing.amount !== p.amount
            ) {
                throw rpcError(status.FAILED_PRECONDITION, 'IDEMPOTENCY_KEY_REUSED');
            }
            return { transaction: existing, alreadyApplied: true };
        }

        const updated =
            p.direction === 'SUBTRACT'
                ? await tx.$queryRaw<Array<{ balance: number }>>`
                    UPDATE "Wallet" SET balance = balance - ${p.amount}, "updatedAt" = now()
                    WHERE id = ${walletId} AND balance >= ${p.amount}
                    RETURNING balance`
                : await tx.$queryRaw<Array<{ balance: number }>>`
                    UPDATE "Wallet" SET balance = balance + ${p.amount}, "updatedAt" = now()
                    WHERE id = ${walletId}
                    RETURNING balance`;
        if (updated.length === 0) {
            // Throwing rolls the ledger insert back: no tx row for a refused debit.
            throw rpcError(status.FAILED_PRECONDITION, 'INSUFFICIENT_CREDITS');
        }

        const transaction = await tx.walletTransaction.update({
            where: { id: txId },
            data: { balanceAfter: updated[0].balance },
        });
        return { transaction, alreadyApplied: false };
    }
}
