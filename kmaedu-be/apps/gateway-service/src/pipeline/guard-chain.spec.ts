import type { AuthUser } from '@kmaedu/auth-jwt';
import { compileRouteTable } from '../routing/route-table';
import { GuardChain } from './guard-chain';

const table = compileRouteTable(
    {
        upstreams: { exam: 'http://exam', content: 'http://content' },
        routes: [
            {
                id: 'ai',
                upstream: 'exam',
                match: { prefix: '/api/v1/ai' },
                auth: 'required',
                permissions: ['ai:generate'],
                pageFlag: 'ai-tool',
                maxBodySize: '1kb',
            },
            {
                id: 'library',
                upstream: 'content',
                match: { prefix: '/api/v1/library' },
                auth: 'required',
                permissions: ['quizset:manage'],
                public: [{ method: 'GET', path: '/api/v1/library/catalog' }],
            },
            { id: 'hook', upstream: 'content', match: { prefix: '/api/v1/hook' }, auth: 'none' },
        ],
        rateLimits: [{ id: 'tight', method: 'POST', path: '/api/v1/ai/tight', window: '60s', max: 1 }],
    },
    {}
);

const teacher: AuthUser = { kind: 'user', id: 't1', sid: 's', roles: ['TEACHER'], emailVerified: true, av: 0 };
const student: AuthUser = { ...teacher, id: 's1', roles: ['STUDENT'] };

function chain(user: AuthUser | undefined, extra: { pages?: boolean | Error; allowed?: boolean } = {}) {
    const limiter = {
        check: jest.fn().mockResolvedValue({ allowed: extra.allowed ?? true, retryAfterSec: 7 }),
    };
    const pages = {
        isEnabled: jest.fn(() =>
            extra.pages instanceof Error
                ? Promise.reject(extra.pages)
                : Promise.resolve(extra.pages ?? true)
        ),
    };
    const verify = jest.fn(() => (user ? Promise.resolve(user) : Promise.reject(new Error('x'))));
    const state = { check: jest.fn().mockResolvedValue('ok') };
    return {
        limiter,
        pages,
        verify,
        gc: new GuardChain({ table, verify, state, limiter, pages } as never),
    };
}

const input = (method: string, pathname: string, headers = { authorization: 'Bearer t' }, extra = {}) => ({
    method,
    pathname,
    headers,
    route: table.match(method, pathname)!,
    ip: '9.9.9.9',
    ...extra,
});

describe('GuardChain', () => {
    it('auth none: no verification, passthrough mode', async () => {
        const c = chain(undefined);
        await expect(c.gc.run(input('POST', '/api/v1/hook/ping'))).resolves.toMatchObject({
            ok: true,
            mode: 'passthrough',
        });
        expect(c.verify).not.toHaveBeenCalled();
    });

    it('coarse permissions: STUDENT is refused on ai, TEACHER passes', async () => {
        await expect(chain(student).gc.run(input('GET', '/api/v1/ai/models'))).resolves.toMatchObject({
            ok: false,
            status: 403,
            code: 'PERMISSION_DENIED',
        });
        await expect(chain(teacher).gc.run(input('GET', '/api/v1/ai/models'))).resolves.toMatchObject({
            ok: true,
            mode: 'verified',
        });
    });

    it('an unverified email is reported as EMAIL_NOT_VERIFIED, not PERMISSION_DENIED', async () => {
        await expect(
            chain({ ...teacher, emailVerified: false }).gc.run(input('GET', '/api/v1/ai/models'))
        ).resolves.toMatchObject({ ok: false, status: 403, code: 'EMAIL_NOT_VERIFIED' });
    });

    it('a public exception is optional and skips the permission check', async () => {
        const d = await chain(student).gc.run(input('GET', '/api/v1/library/catalog'));
        expect(d).toMatchObject({ ok: true, mode: 'verified' });
        const anon = await chain(undefined).gc.run(input('GET', '/api/v1/library/catalog'));
        expect(anon).toMatchObject({ ok: true, mode: 'anonymous', stripToken: true });
        await expect(chain(student).gc.run(input('GET', '/api/v1/library/mine'))).resolves.toMatchObject({
            ok: false,
            code: 'PERMISSION_DENIED',
        });
    });

    it('page flag off -> 403 PAGE_DISABLED; a flag read error fails open', async () => {
        await expect(
            chain(teacher, { pages: false }).gc.run(input('GET', '/api/v1/ai/models'))
        ).resolves.toMatchObject({ ok: false, status: 403, code: 'PAGE_DISABLED' });
        await expect(
            chain(teacher, { pages: new Error('redis') }).gc.run(input('GET', '/api/v1/ai/models'))
        ).resolves.toMatchObject({ ok: true });
    });

    it('content-length above maxBodySize -> 413 before anything is proxied', async () => {
        await expect(
            chain(teacher).gc.run(input('POST', '/api/v1/ai/x', undefined, { contentLength: 2048 }))
        ).resolves.toMatchObject({ ok: false, status: 413, code: 'PAYLOAD_TOO_LARGE' });
        await expect(
            chain(teacher).gc.run(input('POST', '/api/v1/ai/x', undefined, { contentLength: 100 }))
        ).resolves.toMatchObject({ ok: true });
    });

    it('rate limit: 429 with Retry-After; the key subject is the user id, else the ip', async () => {
        const blocked = chain(teacher, { allowed: false });
        await expect(blocked.gc.run(input('POST', '/api/v1/ai/tight'))).resolves.toEqual({
            ok: false,
            status: 429,
            code: 'RATE_LIMITED',
            retryAfterSec: 7,
        });
        expect(blocked.limiter.check).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'tight', max: 1 }),
            't1'
        );
        const anon = chain(undefined);
        await anon.gc.run(input('POST', '/api/v1/hook/ping'));
        expect(anon.limiter.check).toHaveBeenCalledWith(expect.objectContaining({ id: 'default' }), '9.9.9.9');
    });

    it('auth failures never reach the limiter or the page flag', async () => {
        const c = chain(undefined);
        await expect(c.gc.run(input('GET', '/api/v1/ai/models'))).resolves.toMatchObject({
            ok: false,
            status: 401,
        });
        expect(c.limiter.check).not.toHaveBeenCalled();
        expect(c.pages.isEnabled).not.toHaveBeenCalled();
    });
});
