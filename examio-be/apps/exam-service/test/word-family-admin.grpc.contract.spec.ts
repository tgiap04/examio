import { Metadata } from '@grpc/grpc-js';
import { Test } from '@nestjs/testing';
import { lastValueFrom, Observable } from 'rxjs';
import { PROTO_FILES, wordFamilyAdminV1 } from '@examio/contracts';
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
import { WordFamilyAdminGrpcController } from '../src/modules/word-family/word-family-admin.grpc.controller';
import { WordFamilyAdminService } from '../src/modules/word-family/word-family-admin.service';

/** WordFamilyAdminService behind the real stateless guards (a forwarded admin token only). */
describe('WordFamilyAdminService gRPC contract', () => {
    let keys: TestKeyPair;
    let server: TestGrpcServer;
    let client: wordFamilyAdminV1.WordFamilyAdminServiceClient;
    const category = {
        id: 'c1', name: 'Shop', slug: 'shop', description: '', imageUrl: '', order: 0,
        isActive: true, createdAt: '1', updatedAt: '2',
    };
    const service = {
        listCategories: jest.fn(),
        upsertCategory: jest.fn(),
        deleteCategory: jest.fn(),
    };
    const md = async (claims: Record<string, unknown>) => {
        const m = new Metadata();
        m.set('authorization', `Bearer ${await signTestToken(keys, { claims, audience: 'exam' })}`);
        return m;
    };

    beforeAll(async () => {
        keys = await createTestKeyPair('wf-admin');
        const moduleRef = await Test.createTestingModule({
            imports: [
                AuthJwtModule.forRoot({
                    serviceName: 'exam',
                    verifier: {
                        useFactory: () =>
                            createTokenVerifier({
                                issuer: TEST_ISSUER,
                                audiences: [TEST_AUDIENCE, 'exam'],
                                localJwks: { keys: [keys.publicJwk] },
                            }),
                    },
                }),
            ],
            controllers: [WordFamilyAdminGrpcController],
            providers: [{ provide: WordFamilyAdminService, useValue: service }],
        }).compile();
        server = await startTestGrpcServer(moduleRef, [PROTO_FILES.wordFamilyAdmin]);
        client = createTestGrpcClient(server.url, [PROTO_FILES.wordFamilyAdmin])
            .getService<wordFamilyAdminV1.WordFamilyAdminServiceClient>(
                wordFamilyAdminV1.WORD_FAMILY_ADMIN_SERVICE_NAME
            );
    });
    afterAll(() => server.close());
    beforeEach(() => jest.clearAllMocks());

    it('a SYSTEM_ADMIN token reaches the service on every RPC', async () => {
        service.listCategories.mockResolvedValue({ categories: [category] });
        service.upsertCategory.mockResolvedValue({ category });
        service.deleteCategory.mockResolvedValue({ category });
        const m = await md({ sub: 'admin-1', roles: ['SYSTEM_ADMIN'] });
        expect((await lastValueFrom(client.listCategories({ includeInactive: true }, m))).categories).toHaveLength(1);
        expect((await lastValueFrom(client.upsertCategory({ id: '', name: 'Shop', slug: 'shop' }, m))).category?.id).toBe('c1');
        expect((await lastValueFrom(client.deleteCategory({ id: 'c1' }, m))).category?.id).toBe('c1');
        expect(service.listCategories).toHaveBeenCalledWith(expect.objectContaining({ includeInactive: true }));
    });

    it.each(['STUDENT', 'TEACHER'])('a %s token is PERMISSION_DENIED on every RPC', async (role) => {
        const m = await md({ sub: 'x', roles: [role] });
        const calls = [
            client.listCategories({ includeInactive: false }, m),
            client.upsertCategory({ id: '', name: 'x', slug: 'x' }, m),
            client.deleteCategory({ id: 'c1' }, m),
        ];
        for (const c of calls) await expect(lastValueFrom(c as Observable<unknown>)).rejects.toMatchObject({ code: 7 });
        expect(service.listCategories).not.toHaveBeenCalled();
        expect(service.upsertCategory).not.toHaveBeenCalled();
        expect(service.deleteCategory).not.toHaveBeenCalled();
    });

    it('a service token is PERMISSION_DENIED: only a forwarded admin token acts', async () => {
        await expect(
            lastValueFrom(client.deleteCategory({ id: 'c1' }, await md(serviceClaims('admin'))))
        ).rejects.toMatchObject({ code: 7 });
    });

    it('no metadata is UNAUTHENTICATED', async () => {
        await expect(lastValueFrom(client.listCategories({ includeInactive: false }, new Metadata()))).rejects.toMatchObject({ code: 16 });
    });
});
