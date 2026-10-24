import { Controller, Inject } from '@nestjs/common';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { Metadata, status } from '@grpc/grpc-js';
import { Test } from '@nestjs/testing';
import { PROTO_FILES, subscriptionV1, walletV1 } from '@examio/contracts';
import { startTestGrpcServer, type TestGrpcServer } from '@examio/grpc/testing';

export interface FinanceCall {
    rpc: 'Debit' | 'Refund' | 'GetUserBenefits';
    userId: string;
    key?: string;
    amount?: number;
    /** `sub` claim of the bearer token the call carried (a user id, or `svc:<name>`). */
    caller: string;
}

/** What the next Debit/Refund call should do, consumed in order. */
export type Fault =
    /** Apply the effect, then answer UNAVAILABLE (the response was lost: the client retries). */
    | 'apply-then-unavailable'
    /** Do nothing, answer UNAVAILABLE. */
    | 'unavailable'
    /** Do nothing, answer DEADLINE-style failure that is NOT retried (INTERNAL). */
    | 'internal'
    /** Do nothing, answer PERMISSION_DENIED (a definitive refusal). */
    | 'permission-denied'
    /** Do nothing, answer INVALID_ARGUMENT (a definitive refusal). */
    | 'invalid-argument';

export interface FakeFinance {
    server: TestGrpcServer;
    calls: FinanceCall[];
    balances: Map<string, number>;
    filesPerMonth: Map<string, number>;
    debitFaults: Fault[];
    refundFaults: Fault[];
    /** Debits that took effect, by idempotency key. */
    debits: Map<string, { userId: string; amount: number }>;
    /** Refunds that took effect, by debit idempotency key. */
    refunds: Set<string>;
    count(rpc: FinanceCall['rpc'], key?: string): number;
    close(): Promise<void>;
}

const STATE = Symbol('FAKE_FINANCE_STATE');

function subOf(metadata: Metadata): string {
    const bearer = String(metadata.get('authorization')[0] ?? '').replace(/^Bearer /, '');
    const payload = bearer.split('.')[1];
    if (!payload) return '';
    return (JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub?: string }).sub ?? '';
}

const fail = (code: number, message: string) => new RpcException({ code, message });

const tx = (key: string, amount: number, direction: 'ADD' | 'SUBTRACT', balance: number): walletV1.WalletTransaction => ({
    id: `tx_${key}`,
    walletId: 'w1',
    amount,
    direction,
    reason: 'fake',
    idempotencyKey: key,
    balanceAfter: balance,
    createdAt: String(Date.now()),
});

/** A tiny finance-service: idempotent Debit/Refund over in-memory balances, with fault injection. */
export async function startFakeFinance(): Promise<FakeFinance> {
    const state = {
        calls: [] as FinanceCall[],
        balances: new Map<string, number>(),
        filesPerMonth: new Map<string, number>(),
        debitFaults: [] as Fault[],
        refundFaults: [] as Fault[],
        debits: new Map<string, { userId: string; amount: number }>(),
        refunds: new Set<string>(),
    };

    @Controller()
    class FakeWallet {
        constructor(@Inject(STATE) private readonly s: typeof state) {}

        @GrpcMethod('WalletService', 'Debit')
        debit(data: walletV1.DebitRequest, md: Metadata): walletV1.DebitResponse {
            this.s.calls.push({ rpc: 'Debit', userId: data.userId, key: data.idempotencyKey, amount: data.amount, caller: subOf(md) });
            const fault = this.s.debitFaults.shift();
            if (fault === 'unavailable') throw fail(status.UNAVAILABLE, 'down');
            if (fault === 'internal') throw fail(status.INTERNAL, 'boom');
            if (fault === 'permission-denied') throw fail(status.PERMISSION_DENIED, 'PERMISSION_DENIED');
            if (fault === 'invalid-argument') throw fail(status.INVALID_ARGUMENT, 'INVALID_ARGUMENT');
            const existing = this.s.debits.get(data.idempotencyKey);
            let alreadyApplied = true;
            if (!existing) {
                const balance = this.s.balances.get(data.userId) ?? 0;
                if (balance < data.amount) throw fail(status.FAILED_PRECONDITION, 'INSUFFICIENT_CREDITS');
                this.s.balances.set(data.userId, balance - data.amount);
                this.s.debits.set(data.idempotencyKey, { userId: data.userId, amount: data.amount });
                alreadyApplied = false;
            }
            if (fault === 'apply-then-unavailable') throw fail(status.UNAVAILABLE, 'response lost');
            return {
                alreadyApplied,
                transaction: tx(data.idempotencyKey, data.amount, 'SUBTRACT', this.s.balances.get(data.userId) ?? 0),
            };
        }

        @GrpcMethod('WalletService', 'Refund')
        refund(data: walletV1.RefundRequest, md: Metadata): walletV1.RefundResponse {
            this.s.calls.push({ rpc: 'Refund', userId: data.userId, key: data.debitIdempotencyKey, caller: subOf(md) });
            const fault = this.s.refundFaults.shift();
            if (fault === 'unavailable') throw fail(status.UNAVAILABLE, 'down');
            if (fault === 'internal') throw fail(status.INTERNAL, 'boom');
            const debit = this.s.debits.get(data.debitIdempotencyKey);
            if (!debit || debit.userId !== data.userId) throw fail(status.NOT_FOUND, 'DEBIT_NOT_FOUND');
            const alreadyApplied = this.s.refunds.has(data.debitIdempotencyKey);
            if (!alreadyApplied) {
                this.s.refunds.add(data.debitIdempotencyKey);
                this.s.balances.set(data.userId, (this.s.balances.get(data.userId) ?? 0) + debit.amount);
            }
            return {
                alreadyApplied,
                transaction: tx(`refund:${data.debitIdempotencyKey}`, debit.amount, 'ADD', this.s.balances.get(data.userId) ?? 0),
            };
        }

        @GrpcMethod('SubscriptionService', 'GetUserBenefits')
        benefits(data: subscriptionV1.GetUserBenefitsRequest, md: Metadata): subscriptionV1.GetUserBenefitsResponse {
            this.s.calls.push({ rpc: 'GetUserBenefits', userId: data.userId, caller: subOf(md) });
            return {
                tier: 0,
                tierName: 'Free',
                filesPerMonth: this.s.filesPerMonth.get(data.userId) ?? 100,
                messagesPerMinute: 5,
                chatMessagesLimit: 30,
            };
        }
    }

    const moduleRef = await Test.createTestingModule({
        controllers: [FakeWallet],
        providers: [{ provide: STATE, useValue: state }],
    }).compile();
    const server = await startTestGrpcServer(moduleRef, [PROTO_FILES.wallet, PROTO_FILES.subscription]);
    return {
        ...state,
        server,
        count: (rpc, key) => state.calls.filter((c) => c.rpc === rpc && (key === undefined || c.key === key)).length,
        close: () => server.close(),
    };
}
