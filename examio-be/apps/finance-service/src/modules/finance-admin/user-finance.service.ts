import { Injectable } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '../../prisma';
import { financeAdminV1 } from '@examio/contracts';

/** Read model of one user's wallet and subscription for the admin user detail. */
@Injectable()
export class UserFinanceService {
    constructor(private readonly prisma: PrismaService) {}

    async get(userId: string): Promise<financeAdminV1.GetUserFinanceResponse> {
        if (!userId) {
            throw new RpcException({ code: status.INVALID_ARGUMENT, message: 'user_id is required' });
        }
        const [wallet, subscription] = await Promise.all([
            this.prisma.wallet.findUnique({
                where: { userId },
                select: { id: true, balance: true },
            }),
            this.prisma.userSubscription.findUnique({
                where: { userId },
                select: { id: true, tier: true, billingCycle: true, isActive: true },
            }),
        ]);
        return { wallet: wallet ?? undefined, subscription: subscription ?? undefined };
    }
}
