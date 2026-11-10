import { Controller, Inject } from '@nestjs/common';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { Metadata, status } from '@grpc/grpc-js';
import { Test } from '@nestjs/testing';
import { PROTO_FILES, subscriptionV1 } from '@examio/contracts';
import { startTestGrpcServer, type TestGrpcServer } from '@examio/grpc/testing';
import { callerOf } from './token-claims';

export interface BenefitsCall {
    userId: string;
    caller: string;
}

export interface FakeFinance {
    server: TestGrpcServer;
    calls: BenefitsCall[];
    /** The benefits `GetUserBenefits` answers with for `userId` (default: a generous plan). */
    setBenefits(userId: string, benefits: Partial<subscriptionV1.GetUserBenefitsResponse>): void;
    /** Makes `GetUserBenefits` answer UNAVAILABLE. */
    down: { value: boolean };
    close(): Promise<void>;
}

const STATE = Symbol('FAKE_FINANCE_STATE');

export const FREE = { tier: 0, tierName: 'Free', filesPerMonth: 5, messagesPerMinute: 5, chatMessagesLimit: 30 };
const GENEROUS = { tier: 2, tierName: 'Pro', filesPerMonth: -1, messagesPerMinute: 1000, chatMessagesLimit: 1000 };

/** The subscription half of finance ai-chat uses: `GetUserBenefits` as the caller. */
export async function startFakeFinance(): Promise<FakeFinance> {
    const state = {
        calls: [] as BenefitsCall[],
        benefits: new Map<string, subscriptionV1.GetUserBenefitsResponse>(),
        down: { value: false },
    };

    @Controller()
    class FakeSubscription {
        constructor(@Inject(STATE) private readonly s: typeof state) {}

        @GrpcMethod('SubscriptionService', 'GetUserBenefits')
        benefits(data: subscriptionV1.GetUserBenefitsRequest, md: Metadata): subscriptionV1.GetUserBenefitsResponse {
            this.s.calls.push({ userId: data.userId, caller: callerOf(md).sub });
            if (this.s.down.value) throw new RpcException({ code: status.UNAVAILABLE, message: 'down' });
            return this.s.benefits.get(data.userId) ?? GENEROUS;
        }
    }

    const moduleRef = await Test.createTestingModule({
        controllers: [FakeSubscription],
        providers: [{ provide: STATE, useValue: state }],
    }).compile();
    const server = await startTestGrpcServer(moduleRef, [PROTO_FILES.subscription]);
    return {
        calls: state.calls,
        down: state.down,
        server,
        setBenefits: (userId, benefits) => void state.benefits.set(userId, { ...GENEROUS, ...benefits }),
        close: () => server.close(),
    };
}
