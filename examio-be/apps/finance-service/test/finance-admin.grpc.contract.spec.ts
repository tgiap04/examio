import { join } from 'path';
import { Metadata } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { Test } from '@nestjs/testing';
import { lastValueFrom, Observable } from 'rxjs';
import { PROTO_FILES, financeAdminV1 } from '@examio/contracts';
import { createTestGrpcClient, startTestGrpcServer, TestGrpcServer } from '@examio/grpc/testing';
import { AuthJwtModule, createTokenVerifier } from '@examio/auth-jwt';
import {
    TEST_AUDIENCE,
    TEST_ISSUER,
    createTestKeyPair,
    serviceClaims,
    signTestToken,
    type TestKeyPair,
} from '@examio/auth-jwt/testing';
import { FinanceAdminGrpcController } from '../src/modules/finance-admin/finance-admin.grpc.controller';
import { FinanceAdminService } from '../src/modules/finance-admin/finance-admin.service';
import { UserFinanceService } from '../src/modules/finance-admin/user-finance.service';

/** FinanceAdminService behind the real stateless guards: actor comes from the token. */
describe('FinanceAdminService gRPC contract', () => {
    let keys: TestKeyPair;
    let server: TestGrpcServer;
    let client: financeAdminV1.FinanceAdminServiceClient;
    const service = {
        adjustBalance: jest.fn(),
        refundPayment: jest.fn(),
        changeTier: jest.fn(),
        listPayments: jest.fn(),
        listSubscriptions: jest.fn(),
    };

    const userFinance = { get: jest.fn() };

    const md = async (claims: Record<string, unknown>) => {
        const m = new Metadata();
        m.set('authorization', `Bearer ${await signTestToken(keys, { claims, audience: 'finance' })}`);
        return m;
    };
    const adjust = { userId: 'u1', amount: 5, direction: 'ADD', reason: 'goodwill gift', idempotencyKey: 'k' };

    beforeAll(async () => {
        keys = await createTestKeyPair('fin-admin');
        const moduleRef = await Test.createTestingModule({
            imports: [
                AuthJwtModule.forRoot({
                    serviceName: 'finance',
                    verifier: {
                        useFactory: () =>
                            createTokenVerifier({
                                issuer: TEST_ISSUER,
                                audiences: [TEST_AUDIENCE, 'finance'],
                                localJwks: { keys: [keys.publicJwk] },
                            }),
                    },
                }),
            ],
            controllers: [FinanceAdminGrpcController],
            providers: [
                { provide: FinanceAdminService, useValue: service },
                { provide: UserFinanceService, useValue: userFinance },
            ],
        }).compile();
        server = await startTestGrpcServer(moduleRef, [PROTO_FILES.financeAdmin]);
        client = createTestGrpcClient(server.url, [PROTO_FILES.financeAdmin]).getService<financeAdminV1.FinanceAdminServiceClient>(
            financeAdminV1.FINANCE_ADMIN_SERVICE_NAME
        );
    });
    afterAll(() => server.close());
    beforeEach(() => jest.clearAllMocks());

    it('no request message in the contract carries an actor field', () => {
        const root = join(__dirname, '../../../proto');
        const def = loadSync(join(root, PROTO_FILES.financeAdmin.file), { includeDirs: [root] });
        const requests = Object.entries(def).filter(([name, d]) => /Request$/.test(name) && 'format' in d);
        expect(requests).toHaveLength(7);
        for (const [, d] of requests) {
            const fields = ((d as { type: { field: Array<{ name: string }> } }).type.field ?? []).map((f) => f.name);
            expect(fields.filter((f) => /actor|admin/i.test(f))).toEqual([]);
        }
    });

    it('a SYSTEM_ADMIN token passes and the actor handed to the service is the token sub', async () => {
        service.adjustBalance.mockResolvedValue({ userId: 'u1', walletId: 'w1', previousBalance: 1, newBalance: 6, amount: 5, direction: 'ADD', alreadyApplied: false });
        const res = await lastValueFrom(client.adjustBalance(adjust, await md({ sub: 'admin-7', roles: ['SYSTEM_ADMIN'] })));
        expect(res.newBalance).toBe(6);
        expect(service.adjustBalance).toHaveBeenCalledWith(expect.objectContaining(adjust), 'admin-7');
    });

    it.each(['STUDENT', 'TEACHER'])('a %s token is PERMISSION_DENIED on every RPC', async (role) => {
        const m = await md({ sub: 'x', roles: [role] });
        const calls = [
            client.adjustBalance(adjust, m),
            client.refundPayment({ paymentId: 'p', reason: 'customer request', idempotencyKey: 'k' }, m),
            client.changeTier({ userId: 'u', tier: 1, billingCycle: '', reason: 'promo upgrade', idempotencyKey: 'k' }, m),
            client.listPayments({ userId: '', cursor: '', limit: 1 }, m),
            client.listSubscriptions({ cursor: '', limit: 1 }, m),
            client.getUserFinance({ userId: 'u1' }, m),
        ];
        for (const c of calls) await expect(lastValueFrom(c as Observable<unknown>)).rejects.toMatchObject({ code: 7 });
        expect(service.adjustBalance).not.toHaveBeenCalled();
        expect(userFinance.get).not.toHaveBeenCalled();
    });

    it('GetUserFinance with an admin token returns the wallet and subscription summary', async () => {
        userFinance.get.mockResolvedValue({ wallet: { id: 'w1', balance: 7 }, subscription: undefined });
        const res = await lastValueFrom(client.getUserFinance({ userId: 'u1' }, await md({ sub: 'admin-7', roles: ['SYSTEM_ADMIN'] })));
        expect(res.wallet).toEqual({ id: 'w1', balance: 7 });
        expect(res.subscription).toBeUndefined();
        expect(userFinance.get).toHaveBeenCalledWith('u1');
    });

    it('a service token (even svc:admin) is PERMISSION_DENIED: only a forwarded admin token acts', async () => {
        await expect(lastValueFrom(client.adjustBalance(adjust, await md(serviceClaims('admin'))))).rejects.toMatchObject({ code: 7 });
    });

    it('no metadata is UNAUTHENTICATED', async () => {
        await expect(lastValueFrom(client.adjustBalance(adjust, new Metadata()))).rejects.toMatchObject({ code: 16 });
    });
});
