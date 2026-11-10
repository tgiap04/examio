import type { IncomingHttpHeaders } from 'http';
import {
    applyForwardHeaders,
    stripAccessTokenCookie,
    type ForwardContext,
} from './forward-headers';

function target() {
    const headers = new Map<string, string>();
    return {
        headers,
        setHeader: (k: string, v: string) => void headers.set(k.toLowerCase(), v),
        // like the real adapter (`prepare-request.ts`): case-insensitive
        removeHeader: (k: string) =>
            void [...headers.keys()].filter((h) => h.toLowerCase() === k.toLowerCase()).forEach((h) => headers.delete(h)),
    };
}

const base: ForwardContext = {
    requestId: 'req_1',
    mode: 'verified',
    token: 'jwt-1',
    stripToken: false,
    ip: '10.0.0.9',
    proto: 'https',
    host: 'examio.top',
};

function apply(inbound: IncomingHttpHeaders, ctx: Partial<ForwardContext> = {}) {
    const t = target();
    for (const [k, v] of Object.entries(inbound)) t.headers.set(k, String(v));
    applyForwardHeaders(t, inbound, { ...base, ...ctx });
    return t.headers;
}

describe('applyForwardHeaders', () => {
    it('strips every inbound x-user-* header (gateway is the only identity forwarder)', () => {
        const h = apply({
            'x-user-roles': 'SYSTEM_ADMIN',
            'x-user-id': 'evil',
            'x-user-anything': '1',
            'x-keep': 'ok',
        });
        expect([...h.keys()].filter((k) => k.startsWith('x-user-'))).toEqual([]);
        expect(h.get('x-keep')).toBe('ok');
    });

    it('verified: bearer, request id, and a single overwritten forwarding triple', () => {
        const h = apply({
            authorization: 'Bearer old',
            'x-forwarded-for': '6.6.6.6, 10.0.0.9',
            'x-forwarded-proto': 'http',
            'x-forwarded-host': 'evil.example',
            'x-real-ip': '6.6.6.6',
            forwarded: 'for=6.6.6.6',
        });
        expect(h.get('authorization')).toBe('Bearer jwt-1');
        expect(h.get('x-request-id')).toBe('req_1');
        expect(h.get('x-forwarded-for')).toBe('10.0.0.9');
        expect(h.get('x-forwarded-proto')).toBe('https');
        expect(h.get('x-forwarded-host')).toBe('examio.top');
        expect(h.get('x-real-ip')).toBe('10.0.0.9');
        expect(h.has('forwarded')).toBe(false);
    });

    it.each([
        'x-forwarded-port',
        'X-Forwarded-Prefix',
        'x-forwarded-server',
        'X-Original-URL',
        'x-rewrite-url',
    ])('drops the client-supplied %s (only the gateway speaks for the hop)', (name) => {
        const h = apply({ [name]: 'client-value', 'x-keep': 'ok' });
        expect([...h.keys()].some((k) => k.toLowerCase() === name.toLowerCase())).toBe(false);
        expect(h.get('x-keep')).toBe('ok');
    });

    it('anonymous + strip removes authorization and rewrites the accessToken cookie out (RT-6)', () => {
        const h = apply(
            { authorization: 'Bearer revoked', cookie: 'accessToken=revoked; theme=dark; refreshToken=r' },
            { mode: 'anonymous', token: undefined, stripToken: true }
        );
        expect(h.has('authorization')).toBe(false);
        expect(h.get('cookie')).toBe('theme=dark; refreshToken=r');
    });

    it('anonymous + strip removes the cookie header when accessToken was the only cookie', () => {
        const h = apply({ cookie: 'accessToken=x' }, { mode: 'anonymous', token: undefined, stripToken: true });
        expect(h.has('cookie')).toBe(false);
    });

    it('passthrough leaves a non-bearer authorization and cookies untouched', () => {
        const h = apply(
            { authorization: 'Apikey k', cookie: 'accessToken=a' },
            { mode: 'passthrough', token: undefined }
        );
        expect(h.get('authorization')).toBe('Apikey k');
        expect(h.get('cookie')).toBe('accessToken=a');
        expect(h.get('x-forwarded-for')).toBe('10.0.0.9');
    });
});

describe('stripAccessTokenCookie', () => {
    it.each([
        [undefined, undefined],
        ['', undefined],
        ['a=1', 'a=1'],
        ['accessToken=x', undefined],
        ['a=1; accessToken=x; b=2', 'a=1; b=2'],
        ['myaccessToken=1; accessTokenX=2', 'myaccessToken=1; accessTokenX=2'],
    ])('%s -> %s', (input, expected) => {
        expect(stripAccessTokenCookie(input)).toBe(expected);
    });
});
