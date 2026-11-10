import type { IncomingMessage } from 'http';
import type { ForwardContext } from './forward-headers';
import { prepareProxiedRequest, prepareUpgradeRequest } from './prepare-request';
import { forwardContexts } from './proxy-factory';

const CTX: ForwardContext = {
    requestId: 'req_prep',
    mode: 'verified',
    token: 'jwt-1',
    stripToken: false,
    ip: '10.0.0.9',
    proto: 'https',
    host: 'examio.top',
};

const request = (headers: Record<string, string>) =>
    ({ headers: { ...headers }, pipe: jest.fn() }) as unknown as IncomingMessage;
const response = () => ({ headersSent: false, writeHead: jest.fn(), end: jest.fn() }) as never;

describe.each([
    ['without Expect', {}],
    ['with Expect: 100-continue (http-proxy skips its proxyReq event for those)', { expect: '100-continue' }],
])('prepareProxiedRequest %s', (_name, extra) => {
    const spoofed = {
        'x-user-roles': 'SYSTEM_ADMIN',
        'x-user-id': 'admin-1',
        'X-User-Anything': '1',
        'x-forwarded-for': '6.6.6.6, 7.7.7.7',
        'x-real-ip': '6.6.6.6',
        'x-forwarded-host': 'evil.example',
        forwarded: 'for=6.6.6.6',
        'x-request-id': 'req_client',
        'idempotency-key': 'admin-action-1',
        ...extra,
    };

    it('removes identity headers and overwrites the forwarding triple ON the incoming request', () => {
        const req = request(spoofed);
        prepareProxiedRequest(req, response(), {}, CTX);
        const h = req.headers;
        expect(Object.keys(h).filter((k) => k.toLowerCase().startsWith('x-user-'))).toEqual([]);
        expect(h.forwarded).toBeUndefined();
        expect(h['x-forwarded-for']).toBe('10.0.0.9');
        expect(h['x-real-ip']).toBe('10.0.0.9');
        expect(h['x-forwarded-proto']).toBe('https');
        expect(h['x-forwarded-host']).toBe('examio.top');
        expect(h['x-request-id']).toBe('req_prep');
        // a client-chosen Idempotency-Key is forwarded as is: the gateway must not eat it
        expect(h['idempotency-key']).toBe('admin-action-1');
    });

    it('injects the verified token as Authorization, replacing whatever the client sent', () => {
        const req = request({ ...spoofed, authorization: 'Bearer client-sent', cookie: `accessToken=jwt-1; a=b` });
        prepareProxiedRequest(req, response(), {}, CTX);
        expect(req.headers.authorization).toBe('Bearer jwt-1');
        expect(req.headers.cookie).toBe('accessToken=jwt-1; a=b');
    });

    it('never forwards Expect: the gateway has already answered 100-continue and streams the body', () => {
        const req = request(spoofed);
        prepareProxiedRequest(req, response(), {}, CTX);
        expect(req.headers.expect).toBeUndefined();
    });

    it('registers the forward context for the proxy', () => {
        const req = request(spoofed);
        prepareProxiedRequest(req, response(), {}, CTX);
        expect(forwardContexts.get(req)).toBe(CTX);
    });

    it('strips a failed credential from an anonymous (optional) request', () => {
        const req = request({ ...spoofed, authorization: 'Bearer revoked', cookie: 'accessToken=revoked; theme=dark' });
        prepareProxiedRequest(req, response(), {}, { ...CTX, mode: 'anonymous', token: undefined, stripToken: true });
        expect(req.headers.authorization).toBeUndefined();
        expect(req.headers.cookie).toBe('theme=dark');
    });

    it('attaches the byte cap only on capped routes', () => {
        const capped = request(spoofed);
        const original = capped.pipe;
        prepareProxiedRequest(capped, response(), { maxBodyBytes: 1024 }, CTX);
        expect(capped.pipe).not.toBe(original);
        const plain = request(spoofed);
        const plainPipe = plain.pipe;
        prepareProxiedRequest(plain, response(), {}, CTX);
        expect(plain.pipe).toBe(plainPipe);
    });
});

describe('prepareUpgradeRequest (WebSocket handshake)', () => {
    it('sanitises the handshake headers on the request, same rules as HTTP', () => {
        const req = request({
            'x-user-roles': 'SYSTEM_ADMIN',
            'x-forwarded-for': '6.6.6.6',
            cookie: 'accessToken=jwt-1',
            expect: '100-continue',
        });
        prepareUpgradeRequest(req, CTX);
        expect(req.headers['x-user-roles']).toBeUndefined();
        expect(req.headers['x-forwarded-for']).toBe('10.0.0.9');
        expect(req.headers.authorization).toBe('Bearer jwt-1');
        expect(req.headers.expect).toBeUndefined();
        expect(forwardContexts.get(req)).toBe(CTX);
    });
});
