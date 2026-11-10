import { AuthStateService, type AuthStateRedis } from './auth-state.service';

const user = { id: 'u1', sid: 's1', av: 2 };

function redis(values: (string | null)[] | Error): jest.Mocked<AuthStateRedis> {
    return {
        mget: jest.fn(() =>
            values instanceof Error ? Promise.reject(values) : Promise.resolve(values)
        ),
        setMax: jest.fn().mockResolvedValue(1),
        setRevoked: jest.fn().mockResolvedValue('OK'),
    };
}
const get = (path: string, method = 'GET') => ({ method, pathname: path });
const down = () => redis(new Error('Connection is closed.'));

describe('AuthStateService.check', () => {
    it('reads the revoked-sid and av keys in one round trip', async () => {
        const r = redis([null, null]);
        await new AuthStateService(r).check(user, get('/api/v1/quizsets'));
        expect(r.mget).toHaveBeenCalledTimes(1);
        expect(r.mget).toHaveBeenCalledWith('gw:revoked:sid:s1', 'gw:user:u1:av');
    });

    it('passes when nothing is stored', async () => {
        const svc = new AuthStateService(redis([null, null]));
        await expect(svc.check(user, get('/api/v1/x'))).resolves.toBe('ok');
    });

    it('rejects a revoked session', async () => {
        const svc = new AuthStateService(redis(['1', null]));
        await expect(svc.check(user, get('/api/v1/x'))).resolves.toBe('revoked');
    });

    it('revocation wins over staleness', async () => {
        const svc = new AuthStateService(redis(['1', '9']));
        await expect(svc.check(user, get('/api/v1/x'))).resolves.toBe('revoked');
    });

    it('rejects a token whose av is below the stored one (2 vs 3)', async () => {
        const svc = new AuthStateService(redis([null, '3']));
        await expect(svc.check(user, get('/api/v1/x'))).resolves.toBe('stale');
    });

    it('accepts an equal or newer av and ignores a corrupt stored value', async () => {
        await expect(
            new AuthStateService(redis([null, '2'])).check(user, get('/api/v1/x'))
        ).resolves.toBe('ok');
        await expect(
            new AuthStateService(redis([null, '1'])).check(user, get('/api/v1/x'))
        ).resolves.toBe('ok');
        await expect(
            new AuthStateService(redis([null, 'abc'])).check(user, get('/api/v1/x'))
        ).resolves.toBe('ok');
    });

    describe('Redis outage policy (RT-3)', () => {
        it('admin GET fails closed', async () => {
            const svc = new AuthStateService(down());
            await expect(svc.check(user, get('/api/v1/admin/users'))).resolves.toBe('unavailable');
            await expect(svc.check(user, get('/api/v1/admin'))).resolves.toBe('unavailable');
        });

        it('non-admin POST/PUT/PATCH/DELETE fail closed', async () => {
            const svc = new AuthStateService(down());
            for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
                await expect(svc.check(user, get('/api/v1/quizsets', m))).resolves.toBe('unavailable');
            }
        });

        it('non-admin GET, HEAD and WS upgrade pass and bump the counter', async () => {
            const svc = new AuthStateService(down());
            for (const m of ['GET', 'HEAD', 'UPGRADE']) {
                await expect(svc.check(user, get('/api/v1/quizsets', m))).resolves.toBe('ok');
            }
            expect(svc.counters.failedOpen).toBe(3);
            expect(svc.counters.redisUnavailable).toBe(3);
        });

        it('counts a failed closed read too', async () => {
            const svc = new AuthStateService(down());
            await svc.check(user, get('/api/v1/x', 'POST'));
            expect(svc.counters).toEqual({ redisUnavailable: 1, failedOpen: 0 });
        });

        it('a Redis call that never answers is treated as an outage', async () => {
            const hang: AuthStateRedis = {
                mget: () => new Promise(() => undefined),
                setMax: jest.fn(),
                setRevoked: jest.fn(),
            };
            const svc = new AuthStateService(hang, { timeoutMs: 20 });
            await expect(svc.check(user, get('/api/v1/x', 'POST'))).resolves.toBe('unavailable');
            await expect(svc.check(user, get('/api/v1/x', 'GET'))).resolves.toBe('ok');
        });
    });
});

describe('AuthStateService writers', () => {
    it('revokeSession keeps the key until the token would have expired (min 1 s)', async () => {
        const r = redis([null, null]);
        const svc = new AuthStateService(r, { now: () => 1_000_000 });
        await svc.revokeSession('s1', 1_000 + 600);
        expect(r.setRevoked).toHaveBeenCalledWith('gw:revoked:sid:s1', 600);
        await svc.revokeSession('s2', 5);
        expect(r.setRevoked).toHaveBeenLastCalledWith('gw:revoked:sid:s2', 1);
    });

    it('raiseAuthzVersion goes through the SETMAX script', async () => {
        const r = redis([null, null]);
        await new AuthStateService(r).raiseAuthzVersion('u1', 5);
        expect(r.setMax).toHaveBeenCalledWith('gw:user:u1:av', 5);
    });
});
