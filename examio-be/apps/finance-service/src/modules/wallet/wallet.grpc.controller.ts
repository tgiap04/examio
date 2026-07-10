import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { PrismaService } from '@examio/database';
import { GenerateIdService } from '@examio/common';

// gRPC DTOs matching wallet.proto (mapped to camelCase by NestJS)
interface CreateWalletRequest {
    userId: string;
    initialBalance: number;
}

interface GetWalletRequest {
    userId: string;
}

interface UpdateBalanceRequest {
    userId: string;
    amount: number;
    transactionType: string;
    description: string;
}

@Controller()
export class WalletGrpcController {
    constructor(
        private readonly prisma: PrismaService,
        private readonly generateIdService: GenerateIdService
    ) {}

    @GrpcMethod('WalletService', 'CreateWallet')
    async createWallet(data: CreateWalletRequest) {
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
                wallet_id: wallet.id,
                message: 'Wallet created successfully',
            };
        } catch (error) {
            return {
                success: false,
                message: `Failed to create wallet: ${error.message}`,
            };
        }
    }

    @GrpcMethod('WalletService', 'GetWallet')
    async getWallet(data: GetWalletRequest) {
        const wallet = await this.prisma.wallet.findUnique({
            where: { userId: data.userId },
        });

        if (!wallet) {
            return {
                wallet_id: '',
                user_id: data.userId,
                balance: 0,
            };
        }

        return {
            wallet_id: wallet.id,
            user_id: wallet.userId,
            balance: wallet.balance,
        };
    }

    @GrpcMethod('WalletService', 'UpdateBalance')
    async updateBalance(data: UpdateBalanceRequest) {
        try {
            if (!Number.isFinite(data.amount) || data.amount <= 0) {
                return {
                    success: false,
                    new_balance: 0,
                    message: 'Amount must be a positive number',
                };
            }

            const wallet = await this.prisma.wallet.findUnique({
                where: { userId: data.userId },
            });

            if (!wallet) {
                return {
                    success: false,
                    new_balance: 0,
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
                    new_balance: 0,
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
                new_balance: 0,
                message: `Failed to update balance: ${error.message}`,
            };
        }
    }
}
