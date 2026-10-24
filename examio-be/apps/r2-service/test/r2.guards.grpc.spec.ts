import { Metadata } from '@grpc/grpc-js';
import { Test } from '@nestjs/testing';
import { lastValueFrom } from 'rxjs';
import { PROTO_FILES, r2V1 } from '@examio/contracts';
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
import { R2ServiceController } from '../src/r2-service.controller';
import { R2ServiceService } from '../src/r2-service.service';

describe('R2Service gRPC behind the real guards', () => {
    let keys: TestKeyPair;
    let server: TestGrpcServer;
    let client: r2V1.R2ServiceClient;

    const md = async (claims: Record<string, unknown>) => {
        const m = new Metadata();
        m.set('authorization', `Bearer ${await signTestToken(keys, { claims, audience: 'r2' })}`);
        return m;
    };

    beforeAll(async () => {
        keys = await createTestKeyPair('r2-k');
        const moduleRef = await Test.createTestingModule({
            imports: [
                AuthJwtModule.forRoot({
                    serviceName: 'r2',
                    verifier: {
                        useFactory: () =>
                            createTokenVerifier({
                                issuer: TEST_ISSUER,
                                audiences: [TEST_AUDIENCE, 'r2'],
                                localJwks: { keys: [keys.publicJwk] },
                            }),
                    },
                }),
            ],
            controllers: [R2ServiceController],
            providers: [{ provide: R2ServiceService, useValue: { resolveUrl: jest.fn(async (k: string) => `https://cdn/${k}`), getSignedUrl: jest.fn(async (k: string, ttl: number) => `https://signed/${k}?ttl=${ttl}`) } }],
        }).compile();
        server = await startTestGrpcServer(moduleRef, [PROTO_FILES.r2]);
        client = createTestGrpcClient(server.url, [PROTO_FILES.r2]).getService<r2V1.R2ServiceClient>(
            r2V1.R2_SERVICE_NAME
        );
    });
    afterAll(() => server.close());

    const list = (userId: string, m: Metadata) => lastValueFrom(client.listUserFiles({ userId, page: 1, size: 10 }, m));

    it('ListUserFiles: another user\'s id with a user token is PERMISSION_DENIED (IDOR)', async () => {
        await expect(list('victim', await md({ sub: 'attacker', roles: ['STUDENT'] }))).rejects.toMatchObject({ code: 7 });
        await expect(list('', await md({ sub: 'attacker', roles: ['STUDENT'] }))).rejects.toMatchObject({ code: 7 });
    });

    it('ListUserFiles: own id and allowlisted services pass the guard (the RPC itself is UNIMPLEMENTED)', async () => {
        await expect(list('me', await md({ sub: 'me', roles: ['TEACHER'] }))).rejects.toMatchObject({ code: 12 });
        await expect(list('anyone', await md(serviceClaims('exam')))).rejects.toMatchObject({ code: 12 });
    });

    it('GetFileUrl is service-only (no user may mint URLs for arbitrary keys)', async () => {
        const req = { keyR2: 'public/x.png', expiresInSeconds: 60 };
        await expect(lastValueFrom(client.getFileUrl(req, new Metadata()))).rejects.toMatchObject({ code: 16 });
        await expect(
            lastValueFrom(client.getFileUrl(req, await md({ sub: 'u', roles: ['STUDENT'] })))
        ).rejects.toMatchObject({ code: 7 });
        await expect(
            lastValueFrom(client.getFileUrl(req, await md({ sub: 'u', roles: ['SYSTEM_ADMIN'] })))
        ).rejects.toMatchObject({ code: 7 });
        await expect(lastValueFrom(client.getFileUrl(req, await md(serviceClaims('finance'))))).rejects.toMatchObject({ code: 7 });
        const res = await lastValueFrom(client.getFileUrl(req, await md(serviceClaims('exam'))));
        expect(res.url).toBe('https://cdn/public/x.png');
    });

    it('writes are service-only: no token UNAUTHENTICATED, user and non-allowlisted service PERMISSION_DENIED', async () => {
        const req = { keys: ['a'] };
        await expect(lastValueFrom(client.deleteObjects(req, new Metadata()))).rejects.toMatchObject({ code: 16 });
        await expect(lastValueFrom(client.deleteObjects(req, await md({ sub: 'u', roles: ['SYSTEM_ADMIN'] })))).rejects.toMatchObject({ code: 7 });
        await expect(lastValueFrom(client.deleteObjects(req, await md(serviceClaims('finance'))))).rejects.toMatchObject({ code: 7 });
    });

    it('CreatePresignedDownload is document-only; UploadFile and DeleteObjects accept document', async () => {
        const req = { key: 'documents/a.pdf', expiresInSeconds: 60 };
        await expect(lastValueFrom(client.createPresignedDownload(req, new Metadata()))).rejects.toMatchObject({ code: 16 });
        await expect(
            lastValueFrom(client.createPresignedDownload(req, await md({ sub: 'u', roles: ['TEACHER'] })))
        ).rejects.toMatchObject({ code: 7 });
        for (const caller of ['exam', 'auth', 'vocabulary', 'finance']) {
            await expect(
                lastValueFrom(client.createPresignedDownload(req, await md(serviceClaims(caller))))
            ).rejects.toMatchObject({ code: 7 });
        }
        const res = await lastValueFrom(client.createPresignedDownload(req, await md(serviceClaims('document'))));
        expect(res.url).toBe('https://signed/documents/a.pdf?ttl=60');
        // document passes the guard on DeleteObjects (blank key then reaches the handler: INVALID_ARGUMENT)
        await expect(
            lastValueFrom(client.deleteObjects({ keys: [' '] }, await md(serviceClaims('document'))))
        ).rejects.toMatchObject({ code: 3 });
        await expect(
            lastValueFrom(client.uploadFile({ userId: 'u', filename: 'a', content: Buffer.from('x'), mimetype: 'text/plain', folder: 'f' }, await md(serviceClaims('finance'))))
        ).rejects.toMatchObject({ code: 7 });
    });

    it('CreatePresignedDownload defaults to 1h, caps at 24h and rejects a blank key', async () => {
        const m = await md(serviceClaims('document'));
        expect((await lastValueFrom(client.createPresignedDownload({ key: 'k', expiresInSeconds: 0 }, m))).url).toContain('ttl=3600');
        expect((await lastValueFrom(client.createPresignedDownload({ key: 'k', expiresInSeconds: 99999999 }, m))).url).toContain('ttl=86400');
        await expect(lastValueFrom(client.createPresignedDownload({ key: ' ', expiresInSeconds: 5 }, m))).rejects.toMatchObject({ code: 3 });
    });
});
