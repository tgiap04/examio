import { HttpException } from '@nestjs/common';
import { Metadata, status } from '@grpc/grpc-js';
import { of, throwError } from 'rxjs';
import { AuthClient } from './auth.client';

function setup(rpc: jest.Mock) {
    const client = new AuthClient({
        getService: () => ({ setSystemAdmin: rpc, setUserStatus: rpc, setUserRole: rpc, listUsers: rpc, getUser: rpc }),
    } as never);
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

describe('admin AuthClient: the other RPCs', () => {
    const md = () => {
        const m = new Metadata();
        m.set('authorization', 'Bearer admin-token');
        return m;
    };

    it('setUserStatus sends only {userId,isBanned,reason} and the caller metadata', async () => {
        const rpc = jest.fn((..._a: unknown[]) => of({ user: { id: 'u1' } }));
        const m = md();
        await setup(rpc).setUserStatus('u1', true, m, 'spam');
        expect(rpc.mock.calls[0][0]).toEqual({ userId: 'u1', isBanned: true, reason: 'spam' });
        expect(rpc.mock.calls[0][1]).toBe(m);
    });

    it('setUserStatus maps LAST_SYSTEM_ADMIN to 409 and CANNOT_CHANGE_OWN_STATUS to 403', async () => {
        for (const [code, details, http] of [
            [status.ABORTED, 'LAST_SYSTEM_ADMIN', 409],
            [status.PERMISSION_DENIED, 'CANNOT_CHANGE_OWN_STATUS', 403],
        ] as const) {
            const rpc = jest.fn(() => throwError(() => grpcError(code, details)));
            const err = await setup(rpc).setUserStatus('u1', true, md()).catch((e) => e);
            expect([err.getStatus(), err.getResponse().code]).toEqual([http, details]);
            expect(rpc).toHaveBeenCalledTimes(1);
        }
    });

    it('setUserRole sends {userId, role, reason} and no actor', async () => {
        const rpc = jest.fn((..._a: unknown[]) => of({ user: { id: 'u1' } }));
        await setup(rpc).setUserRole('u1', 2, 'why', md());
        expect(rpc.mock.calls[0][0]).toEqual({ userId: 'u1', role: 2, reason: 'why' });
    });

    it('a read (ListUsers) is retried on UNAVAILABLE; a write (SetUserStatus) is not', async () => {
        const flaky = jest
            .fn()
            .mockReturnValueOnce(throwError(() => grpcError(status.UNAVAILABLE, 'down')))
            .mockReturnValue(of({ users: [], page: { total: 0, page: 1, limit: 1 } }));
        await setup(flaky).listUsers({ query: '', page: 1, limit: 1 }, md());
        expect(flaky).toHaveBeenCalledTimes(2);
        const down = jest.fn(() => throwError(() => grpcError(status.UNAVAILABLE, 'down')));
        await setup(down).setUserStatus('u1', true, md()).catch(() => undefined);
        expect(down).toHaveBeenCalledTimes(1);
    });
});
