import { ClientGrpc } from '@nestjs/microservices';
import { Metadata } from '@grpc/grpc-js';
import { of, throwError } from 'rxjs';
import { buildMetadata } from '@kmaedu/grpc';
import { R2Client } from './r2.client';

function setup(overrides: Record<string, jest.Mock> = {}) {
    const service = {
        uploadFile: jest.fn((..._a: unknown[]) => of({ success: true, keyR2: 'k1', fileId: '' })),
        deleteObjects: jest.fn((..._a: unknown[]) => of({ deletedCount: 2 })),
        ...overrides,
    };
    const serviceMetadata = { attach: jest.fn(async (md: Metadata, _audience: string) => md) };
    const client = new R2Client(
        { getService: () => service } as unknown as ClientGrpc,
        serviceMetadata as never
    );
    client.onModuleInit();
    return { client, service, serviceMetadata };
}

describe('R2Client', () => {
    it('forwards the caller metadata to the generated client', async () => {
        const { client, service } = setup();
        const md = buildMetadata({ requestId: 'req_1' });
        await client.deleteObjectsPartial(['a/b.png'], md);
        expect(service.deleteObjects.mock.calls[0][1]).toBe(md);
    });

    it('calls r2 as a service: every operation attaches a token for the r2 audience', async () => {
        const { client, serviceMetadata } = setup();
        const md = buildMetadata();
        await client.deleteObjectsPartial(['a'], md);
        await client.uploadFile('f.png', Buffer.from('x'), 'image/png', undefined, md);
        expect(serviceMetadata.attach).toHaveBeenCalledTimes(2);
        for (const call of serviceMetadata.attach.mock.calls) expect(call[1]).toBe('r2');
    });

    it('uploadFile returns the key and passes metadata', async () => {
        const { client, service } = setup();
        const md = buildMetadata();
        await expect(client.uploadFile('f.png', Buffer.from('x'), 'image/png', 'images', md)).resolves.toBe('k1');
        expect(service.uploadFile.mock.calls[0][1]).toBe(md);
    });

    it('deleteObjectsPartial returns per-key failures', async () => {
        const { client } = setup({
            deleteObjects: jest.fn(() => of({ deletedCount: 1, failedKeys: ['b'] })),
        });
        await expect(client.deleteObjectsPartial(['a', 'b'], buildMetadata())).resolves.toEqual({
            deletedCount: 1,
            failedKeys: ['b'],
        });
    });

    it('rethrows RPC failures', async () => {
        const { client } = setup({
            deleteObjects: jest.fn(() => throwError(() => ({ code: 14, details: 'down' }))),
        });
        await expect(client.deleteObjectsPartial(['k'], buildMetadata())).rejects.toMatchObject({ code: 14 });
    });

    it('omitting metadata does not compile', () => {
        const { client } = setup();
        // Never executed: only the type check matters (ts-jest reports an unused directive as an error).
        const compileOnly = () => {
            // @ts-expect-error metadata is required
            void client.deleteObjectsPartial(['k']);
            // @ts-expect-error metadata is required
            void client.uploadFile('f', Buffer.alloc(0), 'image/png', undefined);
            return new Metadata();
        };
        expect(typeof compileOnly).toBe('function');
    });
});
