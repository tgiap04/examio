import { status } from '@grpc/grpc-js';
import { Observable, of, throwError } from 'rxjs';
import { invokeRpc } from './deadline-retry';

const ALLOWED = 'kmaedu.auth.v1.AuthService/GetUser';
const sleep = jest.fn().mockResolvedValue(undefined);

const failing = (code: number) => () =>
    throwError(() => ({ code, details: 'x' }));

describe('invokeRpc', () => {
    beforeEach(() => sleep.mockClear());

    it('passes a deadline ~3s ahead by default', async () => {
        const invoke = jest.fn((_o: { deadline: number }) => of('ok'));
        const before = Date.now();
        await expect(invokeRpc(ALLOWED, invoke)).resolves.toBe('ok');
        const { deadline } = invoke.mock.calls[0][0];
        expect(deadline).toBeGreaterThanOrEqual(before + 3000);
        expect(deadline).toBeLessThanOrEqual(Date.now() + 3000);
    });

    it('honours a per-call deadline override', async () => {
        const invoke = jest.fn((_o: { deadline: number }) => of(1));
        const before = Date.now();
        await invokeRpc(ALLOWED, invoke, { deadlineMs: 60_000 });
        expect(invoke.mock.calls[0][0].deadline).toBeGreaterThanOrEqual(
            before + 60_000
        );
    });

    it('retries UNAVAILABLE twice for an allowlisted RPC, then fails', async () => {
        const invoke = jest.fn(failing(status.UNAVAILABLE));
        await expect(
            invokeRpc(ALLOWED, invoke, { sleep })
        ).rejects.toMatchObject({ code: status.UNAVAILABLE });
        expect(invoke).toHaveBeenCalledTimes(3);
        expect(sleep).toHaveBeenCalledTimes(2);
        expect(sleep.mock.calls[1][0]).toBeGreaterThan(sleep.mock.calls[0][0]);
    });

    it('retries the idempotent batch delete DeleteObjects on UNAVAILABLE', async () => {
        const invoke = jest.fn(failing(status.UNAVAILABLE));
        await expect(
            invokeRpc('kmaedu.r2.v1.R2Service/DeleteObjects', invoke, { sleep })
        ).rejects.toMatchObject({ code: status.UNAVAILABLE });
        expect(invoke).toHaveBeenCalledTimes(3);
    });

    it('succeeds when a retry recovers', async () => {
        let n = 0;
        const invoke = jest.fn(
            (): Observable<string> =>
                ++n < 2
                    ? throwError(() => ({ code: status.UNAVAILABLE }))
                    : of('recovered')
        );
        await expect(invokeRpc(ALLOWED, invoke, { sleep })).resolves.toBe(
            'recovered'
        );
        expect(invoke).toHaveBeenCalledTimes(2);
    });

    it.each([
        'kmaedu.r2.v1.R2Service/DeleteFile',
        'kmaedu.vocabulary.v1.WordFamilyAdminService/DeleteCategory',
        'kmaedu.r2.v1.R2Service/UploadFile',
        'kmaedu.auth.v1.AuthService/SetUserRole',
    ])('never retries %s', async (rpc) => {
        const invoke = jest.fn(failing(status.UNAVAILABLE));
        await expect(invokeRpc(rpc, invoke, { sleep })).rejects.toMatchObject({
            code: status.UNAVAILABLE,
        });
        expect(invoke).toHaveBeenCalledTimes(1);
        expect(sleep).not.toHaveBeenCalled();
    });

    it('never retries INVALID_ARGUMENT even when allowlisted', async () => {
        const invoke = jest.fn(failing(status.INVALID_ARGUMENT));
        await expect(invokeRpc(ALLOWED, invoke, { sleep })).rejects.toMatchObject(
            { code: status.INVALID_ARGUMENT }
        );
        expect(invoke).toHaveBeenCalledTimes(1);
    });

    it('does not retry DEADLINE_EXCEEDED (budget already spent)', async () => {
        const invoke = jest.fn(failing(status.DEADLINE_EXCEEDED));
        await expect(invokeRpc(ALLOWED, invoke, { sleep })).rejects.toBeDefined();
        expect(invoke).toHaveBeenCalledTimes(1);
    });
});
