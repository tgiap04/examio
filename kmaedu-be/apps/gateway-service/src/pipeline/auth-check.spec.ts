import { TokenVerificationError, type AuthUser, type Principal } from '@kmaedu/auth-jwt';
import { authenticate } from './auth-check';
import type { AuthVerdict } from './auth-state.service';

const USER: AuthUser = {
    kind: 'user',
    id: 'u1',
    sid: 's1',
    roles: ['STUDENT'],
    emailVerified: true,
    av: 1,
};

function deps(principal: Principal | Error = USER, verdict: AuthVerdict = 'ok') {
    return {
        verify: jest.fn(() =>
            principal instanceof Error ? Promise.reject(principal) : Promise.resolve(principal)
        ),
        state: { check: jest.fn().mockResolvedValue(verdict) },
    };
}
const req = { method: 'GET', pathname: '/api/v1/x' };
const bearer = { authorization: 'Bearer t1' };

describe('authenticate: required', () => {
    it('no token -> 401 TOKEN_MISSING without touching the verifier', async () => {
        const d = deps();
        await expect(authenticate({}, 'required', req, d)).resolves.toEqual({
            kind: 'reject',
            status: 401,
            code: 'TOKEN_MISSING',
        });
        expect(d.verify).not.toHaveBeenCalled();
    });

    it('valid token -> the user and the raw token', async () => {
        await expect(authenticate(bearer, 'required', req, deps())).resolves.toEqual({
            kind: 'user',
            user: USER,
            token: 't1',
        });
    });

    it('reads the accessToken cookie when there is no bearer, and never the legacy token cookie', async () => {
        const d = deps();
        await authenticate({ cookie: 'accessToken=c1' }, 'required', req, d);
        expect(d.verify).toHaveBeenCalledWith('c1');
        const legacy = deps();
        const r = await authenticate({ cookie: 'token=old' }, 'required', req, legacy);
        expect(r).toMatchObject({ kind: 'reject', code: 'TOKEN_MISSING' });
    });

    it.each([
        [new TokenVerificationError('TOKEN_EXPIRED'), 'TOKEN_EXPIRED'],
        [new TokenVerificationError('TOKEN_INVALID'), 'TOKEN_INVALID'],
        [new Error('boom'), 'TOKEN_INVALID'],
    ])('verify failure %# -> 401 %s', async (err, code) => {
        await expect(authenticate(bearer, 'required', req, deps(err))).resolves.toEqual({
            kind: 'reject',
            status: 401,
            code,
        });
    });

    it('a service token is not an edge credential -> TOKEN_INVALID', async () => {
        const svc: Principal = { kind: 'service', name: 'exam' };
        await expect(authenticate(bearer, 'required', req, deps(svc))).resolves.toMatchObject({
            code: 'TOKEN_INVALID',
        });
    });

    it.each([
        ['revoked', 401, 'SESSION_REVOKED'],
        ['stale', 401, 'TOKEN_STALE'],
        ['unavailable', 503, 'AUTH_STATE_UNAVAILABLE'],
    ] as const)('state verdict %s -> %i %s', async (verdict, status, code) => {
        await expect(authenticate(bearer, 'required', req, deps(USER, verdict))).resolves.toEqual({
            kind: 'reject',
            status,
            code,
        });
    });
});

describe('authenticate: optional never rejects (RT-6)', () => {
    it('no token -> anonymous, nothing to strip', async () => {
        await expect(authenticate({}, 'optional', req, deps())).resolves.toEqual({
            kind: 'anonymous',
            stripToken: false,
        });
    });

    it.each([
        ['expired', new TokenVerificationError('TOKEN_EXPIRED'), 'ok'],
        ['garbage', new Error('x'), 'ok'],
        ['revoked', USER, 'revoked'],
        ['stale', USER, 'stale'],
        ['redis down on a POST', USER, 'unavailable'],
    ] as const)('%s token -> anonymous and stripped', async (_n, principal, verdict) => {
        await expect(
            authenticate(bearer, 'optional', { method: 'POST', pathname: '/x' }, deps(principal, verdict))
        ).resolves.toEqual({ kind: 'anonymous', stripToken: true });
    });

    it('valid token -> user', async () => {
        await expect(authenticate(bearer, 'optional', req, deps())).resolves.toMatchObject({
            kind: 'user',
        });
    });
});
