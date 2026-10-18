import { HttpException } from '@nestjs/common';
import { Metadata, status } from '@grpc/grpc-js';
import { of, throwError } from 'rxjs';
import { AuthClient } from './auth.client';

function setup(rpc: jest.Mock) {
    const client = new AuthClient({ getService: () => ({ setSystemAdmin: rpc }) } as never);
    client.onModuleInit();
    return client;
}
const grpcError = (code: number, details: string) =>
    Object.assign(new Error(`${code} ${details}`), { code, details });

describe('admin AuthClient.setSystemAdmin', () => {
    it('forwards the caller metadata unchanged and sends NO actor in the body', async () => {
        const rpc = jest.fn((..._a: unknown[]) => of({ user: { id: 'u1', isSystemAdmin: true } }));
        const md = new Metadata();
        md.set('authorization', 'Bearer admin-token');
        const res = await setup(rpc).setSystemAdmin('u1', true, md);
        expect(res.user?.isSystemAdmin).toBe(true);
        expect(rpc.mock.calls[0][0]).toEqual({ userId: 'u1', isSystemAdmin: true, reason: '' });
        expect(rpc.mock.calls[0][1]).toBe(md);
        expect(Object.keys(rpc.mock.calls[0][0] as object).some((k) => /actor|admin_?id/i.test(k))).toBe(false);
    });

    it.each([
        [status.ABORTED, 'LAST_SYSTEM_ADMIN', 409],
        [status.ABORTED, 'ROLE_CHANGE_CONFLICT', 409],
        [status.PERMISSION_DENIED, 'CANNOT_CHANGE_OWN_ROLE', 403],
        [status.PERMISSION_DENIED, 'PERMISSION_DENIED', 403],
        [status.NOT_FOUND, 'USER_NOT_FOUND', 404],
        [status.UNAUTHENTICATED, 'TOKEN_EXPIRED', 401],
    ])('maps gRPC %i %s to HTTP %i keeping the code', async (code, details, http) => {
        const rpc = jest.fn(() => throwError(() => grpcError(code, details)));
        const err = await setup(rpc).setSystemAdmin('u1', false, new Metadata()).catch((e) => e);
        expect(err).toBeInstanceOf(HttpException);
        expect(err.getStatus()).toBe(http);
        expect(err.getResponse()).toMatchObject({ statusCode: http, code: details });
    });

    it('an unreachable auth-service is a 503 and is never retried (not idempotent)', async () => {
        const rpc = jest.fn(() => throwError(() => grpcError(status.UNAVAILABLE, 'down')));
        const err = await setup(rpc).setSystemAdmin('u1', true, new Metadata()).catch((e) => e);
        expect(err.getStatus()).toBe(503);
        expect(rpc).toHaveBeenCalledTimes(1);
    });
});
