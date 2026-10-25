import { request as httpRequest } from 'http';
import * as v8 from 'v8';
import { runInNewContext } from 'vm';
import { bootGateway, type Harness } from './support/boot-gateway';
import { RUN } from './support/tokens';

/**
 * Streaming and size limits: SSE, a 30MB upload, 413, and the credential
 * sources the gateway refuses. Needs Redis (REDIS_HOST/PORT) and RabbitMQ (RABBITMQ_URL, gateway user).
 */
describe('gateway streaming (e2e)', () => {
    let h: Harness;
    // Distinct, per-run client addresses keep rate-limit buckets independent.
    const ip = (n: number) => `10.${(Number.parseInt(RUN, 36) % 200) + 20}.${n}.7`;
    const via = (n: number) => ({ 'x-forwarded-for': `203.0.113.250, ${ip(n)}` });

    beforeAll(async () => {
        h = await bootGateway();
    }, 60_000);
    afterAll(() => h?.close());
    beforeEach(() => {
        for (const u of [h.exam, h.document, h.aichat, h.auth, h.finance, h.admin]) u.reset();
    });

    it('SSE chunks reach the client before the upstream finishes', async () => {
        let upstreamEnded = false;
        // /ai-chat is served by ai-chat-service
        h.aichat.handler = (_req, res) => {
            res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
            res.write('data: one\n\n');
            setTimeout(() => {
                upstreamEnded = true;
                res.end('data: two\n\n');
            }, 700);
        };
        const token = await h.issuer.user('chat', ['TEACHER']);
        const firstChunk = await new Promise<{ text: string; upstreamEndedYet: boolean }>((resolve, reject) => {
            const req = httpRequest(
                `${h.baseUrl}/api/v1/ai-chat/c1/stream`,
                { method: 'POST', headers: { authorization: `Bearer ${token}`, ...via(2) } },
                (res) => {
                    res.once('data', (chunk: Buffer) => {
                        resolve({ text: chunk.toString(), upstreamEndedYet: upstreamEnded });
                        req.destroy();
                    });
                }
            );
            req.on('error', (e) => (upstreamEnded ? undefined : reject(e)));
            req.end();
        });
        expect(firstChunk.text).toContain('data: one');
        expect(firstChunk.upstreamEndedYet).toBe(false);
    });

    it('a client that leaves mid-stream closes the upstream request too (no orphaned LLM call)', async () => {
        let upstreamClosedEarly: (() => void) | undefined;
        const closed = new Promise<boolean>((resolve) => {
            upstreamClosedEarly = () => resolve(true);
            setTimeout(() => resolve(false), 3_000);
        });
        h.aichat.handler = (_req, res) => {
            res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
            res.write('data: one\n\n');
            const finish = setTimeout(() => res.end('data: two\n\n'), 5_000);
            res.on('close', () => {
                clearTimeout(finish);
                if (!res.writableEnded) upstreamClosedEarly?.();
            });
        };
        const token = await h.issuer.user('chat', ['TEACHER']);
        await new Promise<void>((resolve, reject) => {
            const req = httpRequest(
                `${h.baseUrl}/api/v1/ai-chat/c2/stream`,
                { method: 'POST', headers: { authorization: `Bearer ${token}`, ...via(4) } },
                (res) => {
                    res.once('data', () => {
                        req.destroy();
                        resolve();
                    });
                }
            );
            req.on('error', () => undefined);
            req.on('close', () => resolve());
            req.on('timeout', () => reject(new Error('no first chunk')));
            req.end();
        });
        // The upstream must see its response socket close long before its own 5 s end.
        expect(await closed).toBe(true);
    });

    it('streams a 30MB upload: bytes reach the upstream mid-send and Buffer memory stays flat', async () => {
        const total = 30 * 1024 * 1024;
        const half = total / 2;
        const chunk = Buffer.alloc(1024 * 1024, 7);
        const token = await h.issuer.user('uploader', ['TEACHER']);
        // Answer only once the whole body has been consumed (like a real upload handler).
        h.document.handler = (req, res) => {
            req.on('end', () => void res.writeHead(200).end('{"uploaded":true}'));
        };
        // Live Buffer memory (after a forced GC, so freed chunks do not count) while
        // the transfer runs: a gateway that buffers the body peaks at >= 30MB, a
        // streaming one at a few pipe buffers.
        v8.setFlagsFromString('--expose-gc');
        const gc = runInNewContext('gc') as () => void;
        const buffers = () => (gc(), process.memoryUsage().arrayBuffers);
        const baseline = buffers();
        let peak = 0;
        const sampler = setInterval(() => (peak = Math.max(peak, buffers() - baseline)), 15);
        let upstreamBytesAtHalf = -1;

        const status = await new Promise<number>((resolve, reject) => {
            const req = httpRequest(
                `${h.baseUrl}/api/v1/ai/upload-image`,
                {
                    method: 'POST',
                    headers: {
                        authorization: `Bearer ${token}`,
                        'content-type': 'application/octet-stream',
                        'content-length': String(total),
                        ...via(3),
                    },
                },
                (r) => {
                    r.resume();
                    r.on('end', () => resolve(r.statusCode ?? 0));
                }
            );
            req.on('error', reject);
            let sent = 0;
            const pump = async (): Promise<void> => {
                while (sent < total) {
                    if (sent === half && upstreamBytesAtHalf < 0) {
                        // Proof of streaming: the gateway cannot have the first half at the
                        // upstream unless it forwards chunks as they arrive.
                        for (let i = 0; i < 100 && (h.document.seen[0]?.bytes ?? 0) < half * 0.6; i++) {
                            await new Promise((r) => setTimeout(r, 20));
                        }
                        upstreamBytesAtHalf = h.document.seen[0]?.bytes ?? 0;
                    }
                    sent += chunk.length;
                    if (!req.write(chunk)) await new Promise((r) => req.once('drain', r));
                }
                req.end();
            };
            pump().catch(reject);
        });

        clearInterval(sampler);
        const peakMb = peak / 1024 / 1024;
        expect(status).toBe(200);
        expect(h.document.seen[0].bytes).toBe(total);
        expect(upstreamBytesAtHalf).toBeGreaterThanOrEqual(half * 0.6);
        expect(peakMb).toBeLessThan(12);
    }, 60_000);

    it('413 PAYLOAD_TOO_LARGE on content-length before anything is proxied', async () => {
        const token = await h.issuer.user('big', ['TEACHER']);
        const status = await new Promise<number>((resolve, reject) => {
            const req = httpRequest(
                `${h.baseUrl}/api/v1/r2/image`,
                {
                    method: 'POST',
                    headers: {
                        authorization: `Bearer ${token}`,
                        'content-length': String(50 * 1024 * 1024),
                        ...via(4),
                    },
                },
                (r) => {
                    r.resume();
                    resolve(r.statusCode ?? 0);
                    req.destroy();
                }
            );
            req.on('error', () => undefined);
            req.write('x');
            setTimeout(() => reject(new Error('no response')), 5000).unref();
        });
        expect(status).toBe(413);
        expect(h.document.seen).toHaveLength(0);
    });

    it('a CHUNKED body over maxBodySize (no Content-Length) is cut: 413, upstream gets at most the cap; under the cap passes', async () => {
        const cap = 3 * 1024 * 1024; // r2-image
        const send = (chunks: number) =>
            new Promise<{ status: number; body: string }>(async (resolve) => {
                const token = await h.issuer.user(`chunked${chunks}`, ['TEACHER']);
                const req = httpRequest(
                    `${h.baseUrl}/api/v1/r2/image`,
                    { method: 'POST', headers: { authorization: `Bearer ${token}`, 'transfer-encoding': 'chunked', ...via(13 + chunks) } },
                    (res) => {
                        let body = '';
                        res.on('data', (c) => (body += c));
                        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
                        res.on('close', () => resolve({ status: res.statusCode ?? 0, body }));
                    }
                );
                req.on('error', () => resolve({ status: 0, body: '' }));
                const chunk = Buffer.alloc(256 * 1024, 5);
                let i = 0;
                const pump = () => {
                    while (i < chunks) {
                        i++;
                        if (!req.write(chunk)) return void req.once('drain', pump);
                    }
                    req.end();
                };
                pump();
            });

        h.document.handler = (req, res) => {
            req.on('end', () => void res.writeHead(200).end('{"stored":true}'));
            req.on('error', () => undefined);
        };
        const over = await send(20); // 5MB
        expect(over.status).toBe(413);
        expect(JSON.parse(over.body)).toMatchObject({ statusCode: 413, code: 'PAYLOAD_TOO_LARGE' });
        await new Promise((r) => setTimeout(r, 200));
        expect(h.document.seen[0].bytes).toBeLessThanOrEqual(cap);

        h.document.reset();
        h.document.handler = (req, res) => {
            req.on('end', () => void res.writeHead(200).end('{"stored":true}'));
        };
        const under = await send(8); // 2MB
        expect(under.status).toBe(200);
        expect(h.document.seen[0].bytes).toBe(8 * 256 * 1024);
    });

    it('does not accept a token from the query string or the retired token cookie', async () => {
        const token = await h.issuer.user('qs', ['TEACHER']);
        const viaQuery = await fetch(`${h.baseUrl}/api/v1/quizsets?token=${token}`);
        const viaLegacy = await fetch(`${h.baseUrl}/api/v1/quizsets`, {
            headers: { cookie: `token=${token}` },
        });
        expect(viaQuery.status).toBe(401);
        expect(viaLegacy.status).toBe(401);
        expect(h.exam.seen).toHaveLength(0);
    });
});
