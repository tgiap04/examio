import { Metadata } from '@grpc/grpc-js';
import { Test } from '@nestjs/testing';
import { lastValueFrom } from 'rxjs';
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
import { FinanceStatsGrpcController } from '../src/modules/stats/finance-stats.grpc.controller';
import { FinanceStatsService } from '../src/modules/stats/finance-stats.service';

/** FinanceStatsService behind the real stateless guards: `stats:read` on a forwarded token. */
describe('FinanceStatsService gRPC contract', () => {
    let keys: TestKeyPair;
    let server: TestGrpcServer;
    let client: financeAdminV1.FinanceStatsServiceClient;
    const stats = { getRevenueStats: jest.fn() };

    const md = async (claims: Record<string, unknown>) => {
        const m = new Metadata();
        m.set('authorization', `Bearer ${await signTestToken(keys, { claims, audience: 'finance' })}`);
        return m;
    };

    beforeAll(async () => {
        keys = await createTestKeyPair('fin-stats');
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
            controllers: [FinanceStatsGrpcController],
            providers: [{ provide: FinanceStatsService, useValue: stats }],
        }).compile();
        server = await startTestGrpcServer(moduleRef, [PROTO_FILES.financeAdmin]);
        client = createTestGrpcClient(server.url, [PROTO_FILES.financeAdmin]).getService<financeAdminV1.FinanceStatsServiceClient>(
            financeAdminV1.FINANCE_STATS_SERVICE_NAME
        );
    });
    afterAll(() => server.close());
    beforeEach(() => jest.clearAllMocks());

    it('a SYSTEM_ADMIN token (stats:read) gets the aggregates', async () => {
        stats.getRevenueStats.mockResolvedValue({ proUsers: 2, vipUsers: 1, revenueLast30d: '470000', revenueSeries: [] });
        const res = await lastValueFrom(client.getRevenueStats({ days: 30 }, await md({ sub: 'a1', roles: ['SYSTEM_ADMIN'] })));
        expect(res).toMatchObject({ proUsers: 2, vipUsers: 1, revenueLast30d: '470000' });
        expect(stats.getRevenueStats).toHaveBeenCalledWith(expect.objectContaining({ days: 30 }));
    });

    it.each(['STUDENT', 'TEACHER'])('a %s token is PERMISSION_DENIED', async (role) => {
        await expect(lastValueFrom(client.getRevenueStats({ days: 30 }, await md({ sub: 'x', roles: [role] })))).rejects.toMatchObject({ code: 7 });
        expect(stats.getRevenueStats).not.toHaveBeenCalled();
    });

    it('a service token and a missing token are refused', async () => {
        await expect(lastValueFrom(client.getRevenueStats({ days: 30 }, await md(serviceClaims('admin'))))).rejects.toMatchObject({ code: 7 });
        await expect(lastValueFrom(client.getRevenueStats({ days: 30 }, new Metadata()))).rejects.toMatchObject({ code: 16 });
    });
});
