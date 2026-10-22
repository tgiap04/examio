import { Controller } from '@nestjs/common';
import { Metadata } from '@grpc/grpc-js';
import { PrismaService } from '@examio/database';
import { GenerateIdService, invalidateWalletCachesBestEffort } from '@examio/common';
import { RedisService } from '@examio/redis';
import { walletV1 } from '@examio/contracts';
import {
    RequirePermissionsOrService,
    ServiceOnly,
    assertSelfOrService,
    principalOfMetadata,
} from '@examio/auth-jwt';
import { MoneyResult, WalletMoneyService } from './wallet-money.service';

/** Services allowed to move money on a user's behalf (content/document land in phases 14/15). */
const MONEY_CALLERS = ['exam', 'content', 'document'];

function toResponse(result: MoneyResult): {
    transaction: walletV1.WalletTransaction;
    alreadyApplied: boolean;
} {
    const t = result.transaction;
    return {
        alreadyApplied: result.alreadyApplied,
        transaction: {
            id: t.id,
            walletId: t.walletId,
            amount: t.amount,
            direction: t.direction,
            reason: t.description ?? '',
            // callers know their own key; the ledger namespace (`debit:`/`credit:`) stays internal
            idempotencyKey: (t.idempotencyKey ?? '').replace(/^(debit|credit):/, ''),
            balanceAfter: t.balanceAfter ?? 0,
            createdAt: String(t.createdAt.getTime()),
        },
    };
}

@Controller()
@walletV1.WalletServiceControllerMethods()
export class WalletGrpcController implements walletV1.WalletServiceController {
    constructor(
        private readonly prisma: PrismaService,
        private readonly generateIdService: GenerateIdService,
        private readonly redis: RedisService,
        private readonly money: WalletMoneyService
    ) {}

    @ServiceOnly('auth')
    async createWallet(
        data: walletV1.CreateWalletRequest
    ): Promise<walletV1.CreateWalletResponse> {
        if (
            data.initialBalance !== 0 &&
            (!Number.isInteger(data.initialBalance) || data.initialBalance < 0)
        ) {
            return {
                success: false,
                walletId: '',
                message: 'Initial balance must be a non-negative integer',
            };
        }

        try {
            const wallet = await this.prisma.wallet.create({
                data: {
                    id: this.generateIdService.generateId(),
                    userId: data.userId,
                    balance: data.initialBalance || 20,
                },
            });

            await invalidateWalletCachesBestEffort(this.redis, data.userId, wallet.id);
            return {
                success: true,
                walletId: wallet.id,
                message: 'Wallet created successfully',
            };
        } catch (error) {
            return {
                success: false,
                walletId: '',
                message: `Failed to create wallet: ${error.message}`,
            };
        }
    }

    @RequirePermissionsOrService([])
    async getWallet(
        data: walletV1.GetWalletRequest,
        metadata: Metadata
    ): Promise<walletV1.GetWalletResponse> {
        // A user token may only read its OWN wallet; allowlisted services any.
        assertSelfOrService(metadata, data.userId);
        const wallet = await this.prisma.wallet.findUnique({
            where: { userId: data.userId },
        });

        if (!wallet) {
            return {
                walletId: '',
                userId: data.userId,
                balance: 0,
            };
        }

        return {
            walletId: wallet.id,
            userId: wallet.userId,
            balance: wallet.balance,
        };
    }

    /**
     * A user token needs `wallet:use` and may only debit itself; an allowlisted
     * service names the user in the request. Idempotent on `idempotencyKey`.
     * A missing wallet is only minted (welcome credits) for a TEACHER's own
     * token; for an allowlisted service (no role known) it is WALLET_NOT_FOUND.
     */
    @RequirePermissionsOrService(['wallet:use'], { callers: MONEY_CALLERS })
    async debit(
        data: walletV1.DebitRequest,
        metadata: Metadata
    ): Promise<walletV1.DebitResponse> {
        assertSelfOrService(metadata, data.userId);
        const principal = principalOfMetadata(metadata);
        const createWallet = principal?.kind === 'user' && principal.roles.includes('TEACHER');
        return toResponse(await this.money.debit(data, { createWallet }));
    }

    @ServiceOnly(...MONEY_CALLERS)
    async credit(data: walletV1.CreditRequest): Promise<walletV1.CreditResponse> {
        return toResponse(await this.money.credit(data));
    }

    @ServiceOnly(...MONEY_CALLERS)
    async refund(data: walletV1.RefundRequest): Promise<walletV1.RefundResponse> {
        return toResponse(
            await this.money.refund({
                userId: data.userId,
                debitIdempotencyKey: data.debitIdempotencyKey,
                reason: data.reason,
            })
        );
    }
}
