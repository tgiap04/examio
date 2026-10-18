import { S3Client } from '@aws-sdk/client-s3';
import { Metadata } from '@grpc/grpc-js';
import { Test } from '@nestjs/testing';
import { lastValueFrom } from 'rxjs';
import { PROTO_FILES, r2V1 } from '@examio/contracts';
import { createTestGrpcClient, startTestGrpcServer, TestGrpcServer } from '@examio/grpc/testing';
import { R2ServiceController } from '../src/r2-service.controller';
import { R2ServiceService } from '../src/r2-service.service';

const protos = [PROTO_FILES.r2];

describe('R2Service gRPC contract', () => {
    let server: TestGrpcServer;
    let client: r2V1.R2ServiceClient;
    let send: jest.SpyInstance;

    beforeAll(async () => {
        send = jest
            .spyOn(S3Client.prototype, 'send')
            .mockImplementation(async (cmd: unknown) => ({
                // Like R2: every requested key is reported Deleted, existing or not.
                Deleted: (cmd as { input: { Delete: { Objects: { Key: string }[] } } }).input.Delete.Objects,
            }) as never);
        const moduleRef = await Test.createTestingModule({
            controllers: [R2ServiceController],
            providers: [R2ServiceService],
        }).compile();
        server = await startTestGrpcServer(moduleRef, protos);
        client = createTestGrpcClient(server.url, protos).getService<r2V1.R2ServiceClient>(
            r2V1.R2_SERVICE_NAME
        );
    });

    afterAll(async () => {
        await server.close();
        send.mockRestore();
    });

    beforeEach(() => send.mockClear());

    const keys = (n: number) => Array.from({ length: n }, (_, i) => `docs/f-${i}.pdf`);

    it('DeleteObjects with 1500 keys issues 2 S3 batches', async () => {
        const res = await lastValueFrom(
            client.deleteObjects({ keys: keys(1500) }, new Metadata())
        );
        expect(res.deletedCount).toBe(1500);
        expect(send).toHaveBeenCalledTimes(2);
        const sizes = send.mock.calls.map(
            ([cmd]) => cmd.input.Delete.Objects.length
        );
        expect(sizes).toEqual([1000, 500]);
    });

    it('is idempotent: repeating the call for already-deleted keys succeeds', async () => {
        const first = await lastValueFrom(client.deleteObjects({ keys: keys(3) }, new Metadata()));
        const again = await lastValueFrom(client.deleteObjects({ keys: keys(3) }, new Metadata()));
        expect(first.deletedCount).toBe(3);
        expect(again.deletedCount).toBe(3);
    });

    it('empty key list is a no-op success', async () => {
        const res = await lastValueFrom(client.deleteObjects({ keys: [] }, new Metadata()));
        expect(res.deletedCount).toBe(0);
        expect(send).not.toHaveBeenCalled();
    });

    it('rejects a blank key with INVALID_ARGUMENT', async () => {
        await expect(
            lastValueFrom(client.deleteObjects({ keys: ['ok', ' '] }, new Metadata()))
        ).rejects.toMatchObject({ code: 3 });
        expect(send).not.toHaveBeenCalled();
    });

    it('counts only what S3 reports as Deleted', async () => {
        send.mockResolvedValueOnce({ Deleted: [{ Key: 'docs/f-0.pdf' }] } as never);
        const res = await lastValueFrom(client.deleteObjects({ keys: keys(2) }, new Metadata()));
        expect(res.deletedCount).toBe(1);
    });

    it('dedupes repeated keys before calling S3', async () => {
        const res = await lastValueFrom(
            client.deleteObjects({ keys: ['a', 'a', 'b', 'a'] }, new Metadata())
        );
        expect(res.deletedCount).toBe(2);
        expect(send.mock.calls[0][0].input.Delete.Objects).toEqual([{ Key: 'a' }, { Key: 'b' }]);
    });

    it('rejects more than 10000 keys with INVALID_ARGUMENT', async () => {
        await expect(
            lastValueFrom(client.deleteObjects({ keys: keys(10_001) }, new Metadata()))
        ).rejects.toMatchObject({ code: 3 });
        expect(send).not.toHaveBeenCalled();
    });

    it('surfaces partial S3 Errors as INTERNAL instead of reporting success', async () => {
        send.mockResolvedValueOnce({
            Deleted: [{ Key: 'docs/f-1.pdf' }],
            Errors: [{ Key: 'docs/f-0.pdf', Code: 'AccessDenied' }],
        } as never);
        await expect(
            lastValueFrom(client.deleteObjects({ keys: keys(2) }, new Metadata()))
        ).rejects.toMatchObject({ code: 13 });
    });

    it('GetFileUrl round-trips camelCase fields', async () => {
        const res = await lastValueFrom(
            client.getFileUrl({ keyR2: 'public/x.png', expiresInSeconds: 60 }, new Metadata())
        );
        expect(typeof res.url).toBe('string');
        expect(Number(res.expiresAt)).toBeGreaterThan(Date.now());
    });
});
