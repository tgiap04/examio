import { EventEmitter } from 'events';
import type { IncomingMessage } from 'http';
import { compileRouteTable } from '../routing/route-table';
import { trustHops } from '../pipeline/client-ip';
import type { Decision } from '../pipeline/guard-chain';
import { forwardContexts } from '../pipeline/proxy-factory';
import { createUpgradeHandler } from './ws-upgrade.handler';

const table = compileRouteTable(
    {
        upstreams: { exam: 'http://exam' },
        routes: [
            { id: 'ws', upstream: 'exam', match: { prefix: '/ws/study' }, auth: 'required', websocket: true },
            { id: 'plain', upstream: 'exam', match: { prefix: '/api/v1/quizsets' }, auth: 'required' },
        ],
        rateLimits: [],
    },
    {}
);

class FakeSocket extends EventEmitter {
    writable = true;
    write = jest.fn();
    destroy = jest.fn();
}

const flush = () => new Promise((r) => setImmediate(r));

function setup(decision: Decision | Error, withUpgrade = true) {
    const chain = {
        run: jest.fn(async () => {
            if (decision instanceof Error) throw decision;
            return decision;
        }),
    };
    const upgrade = jest.fn();
    const handler = createUpgradeHandler({
        table,
        chain: chain as never,
        proxies: new Map([
            ['ws', Object.assign(jest.fn(), withUpgrade ? { upgrade } : {})],
            ['plain', jest.fn()],
        ]) as never,
        trust: trustHops(1),
    });
    const socket = new FakeSocket();
    const req = (url: string, headers: Record<string, string> = {}) =>
        ({ url, headers: { host: 'gw', ...headers }, socket: { remoteAddress: '172.18.0.5' } }) as unknown as IncomingMessage;
    return { chain, upgrade, handler, socket, req };
}

const statusLine = (s: FakeSocket) => (s.write.mock.calls[0]?.[0] as string | undefined)?.split('\r\n')[0];

describe('WebSocket upgrade handler', () => {
    it('proxies an authorised upgrade after setting the forward context', async () => {
        const { handler, socket, req, upgrade, chain } = setup({ ok: true, mode: 'verified', token: 'tok', stripToken: false });
        const r = req('/ws/study/socket.io/?EIO=4', { 'x-forwarded-for': '6.6.6.6, 10.0.0.9', 'x-request-id': 'req_ws-1' });
        const head = Buffer.from('h');
        handler(r, socket as never, head);
        await flush();

        expect(chain.run).toHaveBeenCalledWith(
            expect.objectContaining({ method: 'UPGRADE', pathname: '/ws/study/socket.io/', ip: '10.0.0.9' })
        );
        expect(forwardContexts.get(r)).toMatchObject({ mode: 'verified', token: 'tok', ip: '10.0.0.9', requestId: 'req_ws-1' });
        expect(upgrade).toHaveBeenCalledWith(r, socket, head);
        expect(socket.destroy).not.toHaveBeenCalled();
    });

    it.each([
        [401, 'Unauthorized', 'TOKEN_MISSING'],
        [403, 'Forbidden', 'PAGE_DISABLED'],
        [429, 'Too Many Requests', 'RATE_LIMITED'],
        [503, 'Service Unavailable', 'AUTH_STATE_UNAVAILABLE'],
    ])('a refused check (%i) writes the status line and closes the socket', async (status, text, code) => {
        const { handler, socket, req, upgrade } = setup({ ok: false, status, code });
        handler(req('/ws/study'), socket as never, Buffer.alloc(0));
        await flush();
        expect(statusLine(socket)).toBe(`HTTP/1.1 ${status} ${text}`);
        expect(socket.destroy).toHaveBeenCalled();
        expect(upgrade).not.toHaveBeenCalled();
    });

    it('closes upgrades for paths that are not a websocket route, without running any check', async () => {
        const { handler, socket, req, chain } = setup({ ok: true, mode: 'verified', stripToken: false });
        handler(req('/api/v1/quizsets'), socket as never, Buffer.alloc(0));
        handler(req('/nowhere'), new FakeSocket() as never, Buffer.alloc(0));
        await flush();
        expect(statusLine(socket)).toBe('HTTP/1.1 404 Not Found');
        expect(chain.run).not.toHaveBeenCalled();
    });

    it('refuses a websocket route whose proxy cannot upgrade', async () => {
        const { handler, socket, req } = setup({ ok: true, mode: 'verified', stripToken: false }, false);
        handler(req('/ws/study'), socket as never, Buffer.alloc(0));
        await flush();
        expect(statusLine(socket)).toBe('HTTP/1.1 404 Not Found');
    });

    it('an unexpected failure is a 500 and a closed socket, never an unhandled rejection', async () => {
        const { handler, socket, req, upgrade } = setup(new Error('redis exploded'));
        handler(req('/ws/study'), socket as never, Buffer.alloc(0));
        await flush();
        expect(statusLine(socket)).toBe('HTTP/1.1 500 Internal Server Error');
        expect(upgrade).not.toHaveBeenCalled();
    });

    it('a socket error destroys the socket instead of crashing the process', () => {
        const { handler, socket, req } = setup({ ok: true, mode: 'verified', stripToken: false });
        handler(req('/ws/study'), socket as never, Buffer.alloc(0));
        socket.emit('error', new Error('ECONNRESET'));
        expect(socket.destroy).toHaveBeenCalled();
    });
});
