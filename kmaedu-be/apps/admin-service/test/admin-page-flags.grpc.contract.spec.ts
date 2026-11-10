import { Metadata } from '@grpc/grpc-js';
import { Test } from '@nestjs/testing';
import { lastValueFrom } from 'rxjs';
import { PROTO_FILES, adminV1 } from '@kmaedu/contracts';
import { createTestGrpcClient, startTestGrpcServer, TestGrpcServer } from '@kmaedu/grpc/testing';
import { AuthJwtModule, createTokenVerifier } from '@kmaedu/auth-jwt';
import {
    TEST_AUDIENCE,
    TEST_ISSUER,
    createTestKeyPair,
    serviceClaims,
    signTestToken,
    type TestKeyPair,
} from '@kmaedu/auth-jwt/testing';
import { AdminPageConfigService } from '../src/modules/admin-page-config/admin-page-config.service';
import { AdminPageFlagsGrpcController } from '../src/modules/admin-page-config/admin-page-flags.grpc.controller';

/** AdminService.GetPageFlags behind the real stateless guards: only the gateway service token. */
describe('AdminService GetPageFlags gRPC contract', () => {
    let keys: TestKeyPair;
    let server: TestGrpcServer;
    let client: adminV1.AdminServiceClient;
    const pages = { getFlags: jest.fn(async () => ({ 'study-room': false, 'flash-card': true })) };

    const md = async (claims: Record<string, unknown>) => {
        const m = new Metadata();
        m.set('authorization', `Bearer ${await signTestToken(keys, { claims, audience: 'admin' })}`);
        return m;
    };

    beforeAll(async () => {
        keys = await createTestKeyPair('admin-flags');
        const moduleRef = await Test.createTestingModule({
            imports: [
                AuthJwtModule.forRoot({
                    serviceName: 'admin',
                    verifier: {
                        useFactory: () =>
                            createTokenVerifier({
                                issuer: TEST_ISSUER,
                                audiences: [TEST_AUDIENCE, 'admin'],
                                localJwks: { keys: [keys.publicJwk] },
                            }),
                    },
                }),
            ],
            controllers: [AdminPageFlagsGrpcController],
            providers: [{ provide: AdminPageConfigService, useValue: pages }],
        }).compile();
        server = await startTestGrpcServer(moduleRef, [PROTO_FILES.admin]);
        client = createTestGrpcClient(server.url, [PROTO_FILES.admin]).getService<adminV1.AdminServiceClient>(
            adminV1.ADMIN_SERVICE_NAME
        );
    });
    afterAll(() => server.close());

    it('the gateway service token gets the flag map', async () => {
        const res = await lastValueFrom(client.getPageFlags({}, await md(serviceClaims('gateway'))));
        expect(res.flags).toEqual({ 'study-room': false, 'flash-card': true });
    });

    it.each([
        ['exam service token', () => serviceClaims('exam')],
        ['SYSTEM_ADMIN user token', () => ({ sub: 'a1', roles: ['SYSTEM_ADMIN'] })],
    ])('a %s is PERMISSION_DENIED', async (_name, claims) => {
        await expect(lastValueFrom(client.getPageFlags({}, await md(claims())))).rejects.toMatchObject({ code: 7 });
    });

    it('no token is UNAUTHENTICATED', async () => {
        await expect(lastValueFrom(client.getPageFlags({}, new Metadata()))).rejects.toMatchObject({ code: 16 });
    });
});
