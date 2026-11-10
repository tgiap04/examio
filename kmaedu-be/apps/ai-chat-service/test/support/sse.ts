import { request as httpRequest, type ClientRequest, type IncomingHttpHeaders } from 'http';

export interface SseConnection {
    status: number;
    headers: IncomingHttpHeaders;
    /** Everything received so far, raw. */
    raw(): string;
    /** The `data:` payloads received so far, parsed. */
    events(): Array<{ type: string; data?: unknown }>;
    /** Resolves once `predicate(raw)` holds; rejects after `timeoutMs`. */
    waitFor(predicate: (raw: string) => boolean, timeoutMs?: number): Promise<void>;
    /** Resolves when the server ends the response. */
    ended: Promise<void>;
    /** Client abort (the socket is destroyed). */
    abort(): void;
}

/** Opens `POST path` on a listening server and keeps the response open for inspection. */
export function openSse(baseUrl: string, path: string, token: string, body: object = {}): Promise<SseConnection> {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body);
        let req!: ClientRequest;
        req = httpRequest(
            `${baseUrl}/api/v1${path}`,
            { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } },
            (res) => {
                let raw = '';
                const listeners = new Set<() => void>();
                res.on('data', (chunk: Buffer) => {
                    raw += chunk.toString();
                    listeners.forEach((fn) => fn());
                });
                const ended = new Promise<void>((done) => {
                    res.on('end', done);
                    res.on('close', done);
                    res.on('error', () => done());
                });
                resolve({
                    status: res.statusCode ?? 0,
                    headers: res.headers,
                    raw: () => raw,
                    events: () =>
                        raw
                            .split('\n\n')
                            .flatMap((frame) => frame.split('\n').filter((line) => line.startsWith('data: ')))
                            .map((line) => JSON.parse(line.slice(6))),
                    waitFor: (predicate, timeoutMs = 10_000) =>
                        new Promise<void>((ok, fail) => {
                            const check = () => {
                                if (predicate(raw)) {
                                    listeners.delete(check);
                                    clearTimeout(timer);
                                    ok();
                                }
                            };
                            const timer = setTimeout(() => {
                                listeners.delete(check);
                                fail(new Error(`SSE condition not met in ${timeoutMs} ms; received: ${JSON.stringify(raw)}`));
                            }, timeoutMs);
                            listeners.add(check);
                            check();
                        }),
                    ended,
                    abort: () => req.destroy(),
                });
            }
        );
        req.on('error', (error) => reject(error));
        req.end(payload);
    });
}
