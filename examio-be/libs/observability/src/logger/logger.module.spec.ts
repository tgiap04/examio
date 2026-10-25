import { IncomingMessage, ServerResponse, createServer } from 'http';
import { Writable } from 'stream';
import pinoHttp from 'pino-http';
import * as request from 'supertest';
import {
    buildPinoHttpOptions,
    generateRequestId,
    isHealthProbe,
} from './logger.module';

function fakeReqRes(headers: Record<string, string | string[]> = {}) {
    const setHeader = jest.fn();
    return {
        req: { headers } as unknown as IncomingMessage,
        res: { setHeader } as unknown as ServerResponse,
        setHeader,
    };
}

describe('generateRequestId', () => {
    it('mints req_<ulid> and echoes it when no x-request-id is sent', () => {
        const { req, res, setHeader } = fakeReqRes();

        const id = generateRequestId(req, res);

        expect(id).toMatch(/^req_[0-9A-HJKMNP-TV-Z]{26}$/);
        expect(setHeader).toHaveBeenCalledWith('X-Request-Id', id);
    });

    it('reuses a well-formed inbound x-request-id', () => {
        const { req, res, setHeader } = fakeReqRes({
            'x-request-id': 'req_01HZZZZZZZZZZZZZZZZZZZZZZZ',
        });

        const id = generateRequestId(req, res);

        expect(id).toBe('req_01HZZZZZZZZZZZZZZZZZZZZZZZ');
        expect(setHeader).toHaveBeenCalledWith('X-Request-Id', id);
    });

    it.each([
        ['contains whitespace/control chars', 'bad id\r\nX-Evil: 1'],
        ['is too long', 'a'.repeat(129)],
        ['is empty', ''],
    ])('replaces an inbound id that %s', (_label, value) => {
        const { req, res } = fakeReqRes({ 'x-request-id': value });

        expect(generateRequestId(req, res)).toMatch(/^req_/);
    });
});

describe('logger configuration', () => {
    const SECRETS = {
        authorization: 'Bearer SECRET-ACCESS-TOKEN',
        cookie: 'sid=SECRET-SESSION-COOKIE',
        setCookie: 'sid=SECRET-SET-COOKIE; HttpOnly',
    };

    /** Drives a real HTTP server through pino-http using the module's own options. */
    async function logRequest(headers: Record<string, string>) {
        const lines: string[] = [];
        const stream = new Writable({
            write(chunk, _enc, cb) {
                lines.push(chunk.toString());
                cb();
            },
        });
        const logger = pinoHttp(
            { ...buildPinoHttpOptions('test-service'), level: 'info' },
            stream
        );
        const server = createServer((req, res) => {
            logger(req, res);
            res.setHeader('Set-Cookie', SECRETS.setCookie);
            res.end('ok');
        });
        const response = await request(server).get('/api/v1/thing').set(headers);
        const records = lines.map((l) => JSON.parse(l));
        return { response, records, raw: lines.join('') };
    }

    it('redacts authorization, cookie and set-cookie in emitted logs', async () => {
        const { records, raw } = await logRequest({
            Authorization: SECRETS.authorization,
            Cookie: SECRETS.cookie,
        });

        expect(records).toHaveLength(1);
        expect(records[0].service).toBe('test-service');
        expect(records[0].req.headers.authorization).toBe('[Redacted]');
        expect(records[0].req.headers.cookie).toBe('[Redacted]');
        expect(records[0].res.headers['set-cookie']).toBe('[Redacted]');
        for (const secret of Object.values(SECRETS)) {
            expect(raw).not.toContain(secret.split(';')[0]);
        }
    });

    it('does not log health probes', () => {
        expect(isHealthProbe({ url: '/health/ready' } as IncomingMessage)).toBe(true);
        expect(isHealthProbe({ url: '/api/v1/auth/me' } as IncomingMessage)).toBe(false);
    });

    it('logs and echoes a well-formed inbound request id', async () => {
        const { response, records } = await logRequest({
            'X-Request-Id': 'req_client-supplied.1',
        });

        expect(response.headers['x-request-id']).toBe('req_client-supplied.1');
        expect(records[0].req.id).toBe('req_client-supplied.1');
    });

    it.each([
        ['spaces', 'has spaces in it'],
        // Node refuses to send raw control chars over HTTP, so those are covered
        // by the generateRequestId unit cases above; here: other disallowed bytes.
        ['disallowed punctuation', 'bad<id>;"quote"'],
        ['over 128 chars', 'a'.repeat(129)],
    ])(
        'replaces a malformed inbound x-request-id (%s) with a generated req_ id',
        async (_label, value) => {
            const { response, records } = await logRequest({
                'X-Request-Id': value,
            });

            const echoed = response.headers['x-request-id'];
            expect(echoed).toMatch(/^req_[0-9A-HJKMNP-TV-Z]{26}$/);
            expect(echoed).not.toBe(value);
            expect(records[0].req.id).toBe(echoed);
        }
    );
});
