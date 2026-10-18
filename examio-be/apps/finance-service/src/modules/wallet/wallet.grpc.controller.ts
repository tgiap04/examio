import { Controller } from '@nestjs/common';
import { Metadata, status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '@examio/database';
import { GenerateIdService } from '@examio/common';
import { walletV1 } from '@examio/contracts';
import { RequirePermissionsOrService, ServiceOnly, assertSelfOrService } from '@examio/auth-jwt';

const unimplemented = (rpc: string): never => {
    throw new RpcException({
        code: status.UNIMPLEMENTED,
        message: `${rpc} is not implemented yet`,
    });
};

@Controller()
@walletV1.WalletServiceControllerMethods()
export class WalletGrpcController implements walletV1.WalletServiceController {
    constructor(
        private readonly prisma: PrismaService,
        private readonly generateIdService: GenerateIdService
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

    @ServiceOnly('exam')
    // Idempotent money RPCs: contract defined in phase 02, server in phase 10.
    debit(_data: walletV1.DebitRequest): Promise<walletV1.DebitResponse> {
        return unimplemented('Debit');
    }

    @ServiceOnly('exam')
    credit(_data: walletV1.CreditRequest): Promise<walletV1.CreditResponse> {
        return unimplemented('Credit');
    }

    @ServiceOnly('exam')
    refund(_data: walletV1.RefundRequest): Promise<walletV1.RefundResponse> {
        return unimplemented('Refund');
    }

    /** @deprecated Replaced by Debit/Credit in phase 10. */
    @ServiceOnly('exam')
    async updateBalance(
        data: walletV1.UpdateBalanceRequest
    ): Promise<walletV1.UpdateBalanceResponse> {
        try {
            if (!Number.isInteger(data.amount) || data.amount <= 0) {
                return {
                    success: false,
                    newBalance: 0,
                    message: 'Amount must be a positive integer',
                };
            }

            const wallet = await this.prisma.wallet.findUnique({
                where: { userId: data.userId },
            });

            if (!wallet) {
                return {
                    success: false,
                    newBalance: 0,
                    message: 'Wallet not found',
                };
            }

            const isAdd = data.transactionType === 'ADD';

            // Atomic increment/decrement + ledger record in a single transaction.
            // For SUBTRACT, the `balance: { gte: data.amount }` guard in the
            // conditional updateMany prevents overdraw/double-spend: the
            // decrement only applies if the wallet still has enough balance at
            // the moment the statement executes on the DB, closing the
            // read-modify-write race that the old code had.
            const result = await this.prisma.$transaction(async (tx) => {
                if (isAdd) {
                    const updated = await tx.wallet.update({
                        where: { id: wallet.id },
                        data: { balance: { increment: data.amount } },
                    });

                    await tx.walletTransaction.create({
                        data: {
                            id: this.generateIdService.generateId(),
                            walletId: wallet.id,
                            amount: data.amount,
                            type: 0,
                            direction: data.transactionType,
                            description: data.description,
                        },
                    });

                    return { ok: true, newBalance: updated.balance };
                }

                const decremented = await tx.wallet.updateMany({
                    where: { id: wallet.id, balance: { gte: data.amount } },
                    data: { balance: { decrement: data.amount } },
                });

                if (decremented.count === 0) {
                    return { ok: false, newBalance: 0 };
                }

                await tx.walletTransaction.create({
                    data: {
                        id: this.generateIdService.generateId(),
                        walletId: wallet.id,
                        amount: data.amount,
                        type: 4,
                        direction: data.transactionType,
                        description: data.description,
                    },
                });

                const updated = await tx.wallet.findUniqueOrThrow({
                    where: { id: wallet.id },
                });

                return { ok: true, newBalance: updated.balance };
            });

            if (!result.ok) {
                return {
                    success: false,
                    newBalance: 0,
                    message: 'Insufficient balance',
                };
            }

            return {
                success: true,
                newBalance: result.newBalance,
                message: 'Balance updated successfully',
            };
        } catch (error) {
            return {
                success: false,
                newBalance: 0,
                message: `Failed to update balance: ${error.message}`,
            };
        }
    }
}
