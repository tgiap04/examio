import { compileRouteTable } from './route-table';

const raw = {
    upstreams: { exam: 'http://exam', auth: 'http://auth' },
    routes: [
        {
            id: 'ai-upload',
            upstream: 'exam',
            match: { path: '^/api/v1/ai/(upload.*|quick-upload)$' },
            auth: 'required',
        },
        { id: 'ai', upstream: 'exam', match: { prefix: '/api/v1/ai' }, auth: 'required' },
        { id: 'ai-chat', upstream: 'exam', match: { prefix: '/api/v1/ai-chat' }, auth: 'required' },
        { id: 'api', upstream: 'exam', match: { prefix: '/api/v1' }, auth: 'required' },
        {
            id: 'auth-read',
            upstream: 'auth',
            match: { prefix: '/api/v1/auth' },
            methods: ['GET'],
            auth: 'required',
        },
    ],
    rateLimits: [],
};
const table = compileRouteTable(raw, {});
const id = (method: string, path: string) => table.match(method, path)?.id;

describe('route matcher', () => {
    it('a path regex wins over any prefix', () => {
        expect(id('POST', '/api/v1/ai/quick-upload')).toBe('ai-upload');
        expect(id('GET', '/api/v1/ai/upload/u1/history')).toBe('ai-upload');
    });

    it('the longest prefix wins', () => {
        expect(id('GET', '/api/v1/ai/models')).toBe('ai');
        expect(id('GET', '/api/v1/ai-chat/c1/messages')).toBe('ai-chat');
        expect(id('GET', '/api/v1/quizsets')).toBe('api');
    });

    it('prefixes match on a segment boundary', () => {
        expect(id('GET', '/api/v1/ai')).toBe('ai');
        expect(id('GET', '/api/v1/aix/y')).toBe('api');
        expect(id('GET', '/api/v10/ai')).toBeUndefined();
    });

    it('honours the methods filter and falls through to a shorter prefix', () => {
        expect(id('GET', '/api/v1/auth/me')).toBe('auth-read');
        expect(id('POST', '/api/v1/auth/login')).toBe('api');
    });

    it('rejects traversal, encoded separators and backslashes', () => {
        for (const path of [
            '/api/v1/ai/../auth/me',
            '/api/v1/./quizsets',
            '/api/v1/ai/%2e%2e/x',
            '/api/v1/ai%2Fx',
            '/api/v1/ai%5cx',
            '/api/v1\\quizsets',
        ]) {
            expect(id('GET', path)).toBeUndefined();
        }
    });

    it('returns nothing outside every prefix', () => {
        expect(id('GET', '/')).toBeUndefined();
        expect(id('GET', '/health/live')).toBeUndefined();
    });
});

describe('route config validation', () => {
    const bad = (patch: Record<string, unknown>) => () =>
        compileRouteTable({ ...raw, ...patch }, {});

    it('rejects an unknown upstream', () => {
        expect(
            bad({
                routes: [{ id: 'x', upstream: 'nope', match: { prefix: '/a' }, auth: 'none' }],
            })
        ).toThrow(/upstream/i);
    });

    it('rejects duplicate route ids', () => {
        const r = raw.routes[0];
        expect(bad({ routes: [r, r] })).toThrow(/duplicate/i);
    });

    it('rejects permissions on an unauthenticated route', () => {
        expect(
            bad({
                routes: [
                    {
                        id: 'x',
                        upstream: 'exam',
                        match: { prefix: '/a' },
                        auth: 'none',
                        permissions: ['ai:generate'],
                    },
                ],
            })
        ).toThrow(/permissions/i);
    });

    it('rejects an invalid regular expression and an unknown permission', () => {
        expect(
            bad({
                routes: [{ id: 'x', upstream: 'exam', match: { path: '(' }, auth: 'none' }],
            })
        ).toThrow();
        expect(
            bad({
                routes: [
                    {
                        id: 'x',
                        upstream: 'exam',
                        match: { prefix: '/a' },
                        auth: 'required',
                        permissions: ['made:up'],
                    },
                ],
            })
        ).toThrow();
    });

    it('interpolates ${VAR} and ${VAR:-default}, and fails on a missing required one', () => {
        const mk = (u: string, env: Record<string, string>) =>
            compileRouteTable({ ...raw, upstreams: { exam: u, auth: 'http://auth' } }, env);
        expect(mk('${EXAM_URL}', { EXAM_URL: 'http://e:1' }).match('GET', '/api/v1/q')?.target).toBe(
            'http://e:1'
        );
        expect(mk('${EXAM_URL:-http://d:2}', {}).match('GET', '/api/v1/q')?.target).toBe(
            'http://d:2'
        );
        expect(() => mk('${EXAM_URL}', {})).toThrow(/EXAM_URL/);
    });
});
