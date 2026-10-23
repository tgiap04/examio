import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';

export interface FakeAiService {
    /** `http://127.0.0.1:<port>/api`: what `AI_SERVICE_URL` points at. */
    url: string;
    /** Every request the fake received (path, internal-token header, parsed body). */
    requests: Array<{ path: string; token: string | undefined; body: Record<string, unknown> }>;
    close(): Promise<void>;
}

/**
 * Stands in for ai-service `POST /api/generate/word-family` over real HTTP, so the
 * production `AiClient` (axios, `x-internal-service-token`) is what the specs exercise.
 */
export async function startFakeAiService(): Promise<FakeAiService> {
    const requests: FakeAiService['requests'] = [];
    const server: Server = createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<string, unknown>;
            requests.push({
                path: req.url ?? '',
                token: req.headers['x-internal-service-token'] as string | undefined,
                body,
            });
            res.setHeader('content-type', 'application/json');
            res.end(
                JSON.stringify({
                    success: true,
                    data: {
                        rootWord: 'order',
                        categorySlug: body.categorySlug,
                        words: [
                            {
                                word: 'order',
                                pos: 'verb',
                                meaningEn: 'to request',
                                meaningVi: 'đặt hàng',
                                example: 'I order tea.',
                                affix: { prefix: '', root: 'order', suffix: '' },
                            },
                        ],
                    },
                })
            );
        });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    return {
        url: `http://127.0.0.1:${port}/api`,
        requests,
        close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    };
}
