import { ClientGrpc } from '@nestjs/microservices';
import { Metadata } from '@grpc/grpc-js';
import { of } from 'rxjs';
import { buildMetadata } from '@kmaedu/grpc';
import { R2Client } from './r2.client';

function setup(deleteObjects: jest.Mock) {
    const serviceMetadata = { attach: jest.fn(async (md: Metadata, _audience: string) => md) };
    const client = new R2Client(
        { getService: () => ({ deleteObjects }) } as unknown as ClientGrpc,
        serviceMetadata as never
    );
    client.onModuleInit();
    return { client, serviceMetadata };
}

describe('R2Client (vocabulary)', () => {
    it('deletes as a service for the r2 audience and returns per-key failures', async () => {
        const deleteObjects = jest.fn((..._a: unknown[]) =>
            of({ deletedCount: 1, failedKeys: ['b'] })
        );
        const { client, serviceMetadata } = setup(deleteObjects);
        const md = buildMetadata({ requestId: 'req_1' });

        await expect(client.deleteObjectsPartial(['a', 'b'], md)).resolves.toEqual({
            deletedCount: 1,
            failedKeys: ['b'],
        });
        expect(serviceMetadata.attach.mock.calls[0][1]).toBe('r2');
        expect(deleteObjects.mock.calls[0][0]).toEqual({ keys: ['a', 'b'] });
        expect(deleteObjects.mock.calls[0][1]).toBe(md);
    });

    it('treats a missing failedKeys as none', async () => {
        const { client } = setup(jest.fn(() => of({ deletedCount: 1 })));
        await expect(client.deleteObjectsPartial(['a'], buildMetadata())).resolves.toEqual({
            deletedCount: 1,
            failedKeys: [],
        });
    });
});
