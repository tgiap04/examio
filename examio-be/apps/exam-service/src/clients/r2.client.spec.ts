import { ClientGrpc } from '@nestjs/microservices';
import { Metadata } from '@grpc/grpc-js';
import { of, throwError } from 'rxjs';
import { buildMetadata } from '@examio/grpc';
import { R2Client } from './r2.client';

function setup(overrides: Record<string, jest.Mock> = {}) {
    const service = {
        uploadFile: jest.fn((..._a: unknown[]) => of({ success: true, keyR2: 'k1', fileId: '' })),
        deleteFile: jest.fn((..._a: unknown[]) => of({ success: true, message: '' })),
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
        await client.deleteFile('a/b.png', md);
        expect(service.deleteFile.mock.calls[0][1]).toBe(md);
    });

    it('calls r2 as a service: every operation attaches a token for the r2 audience', async () => {
        const { client, serviceMetadata } = setup();
        const md = buildMetadata();
        await client.deleteFile('a.png', md);
        await client.deleteObjects(['a'], md);
        await client.uploadFile('f.png', Buffer.from('x'), 'image/png', undefined, md);
        expect(serviceMetadata.attach).toHaveBeenCalledTimes(3);
        for (const call of serviceMetadata.attach.mock.calls) expect(call[1]).toBe('r2');
    });

    it('uploadFile returns the key and passes metadata', async () => {
        const { client, service } = setup();
        const md = buildMetadata();
        await expect(client.uploadFile('f.png', Buffer.from('x'), 'image/png', 'images', md)).resolves.toBe('k1');
        expect(service.uploadFile.mock.calls[0][1]).toBe(md);
    });

    it('deleteObjects resolves with the deleted count', async () => {
        const { client } = setup();
        await expect(client.deleteObjects(['a', 'b'], buildMetadata())).resolves.toBe(2);
    });

    it('rethrows RPC failures', async () => {
        const { client } = setup({
            deleteFile: jest.fn(() => throwError(() => ({ code: 14, details: 'down' }))),
        });
        await expect(client.deleteFile('k', buildMetadata())).rejects.toMatchObject({ code: 14 });
    });

    it('omitting metadata does not compile', () => {
        const { client } = setup();
        // Never executed: only the type check matters (ts-jest reports an unused directive as an error).
        const compileOnly = () => {
            // @ts-expect-error metadata is required
            void client.deleteFile('k');
            // @ts-expect-error metadata is required
            void client.deleteObjects(['k']);
            // @ts-expect-error metadata is required
            void client.uploadFile('f', Buffer.alloc(0), 'image/png', undefined);
            return new Metadata();
        };
        expect(typeof compileOnly).toBe('function');
    });
});
