import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';
import type { AddressInfo } from 'net';
import { WebSocketServer } from 'ws';

export interface Seen {
    method: string;
    url: string;
    headers: IncomingMessage['headers'];
    bytes: number;
}

export type Handler = (req: IncomingMessage, res: ServerResponse, seen: Seen) => void;

const DEFAULT_HANDLER: Handler = (_req, res) =>
    void res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');

/** A throwaway HTTP (+WebSocket) upstream that records what the gateway forwards. */
export class FakeUpstream {
    readonly seen: Seen[] = [];
    readonly upgrades: IncomingMessage[] = [];
    private server!: Server;
    private readonly wss = new WebSocketServer({ noServer: true });
    handler: Handler = DEFAULT_HANDLER;
    url = '';
    private port = 0;

    async start(): Promise<this> {
        this.server = createServer((req, res) => {
            const seen: Seen = { method: req.method!, url: req.url!, headers: req.headers, bytes: 0 };
            this.seen.push(seen);
            req.on('data', (chunk: Buffer) => (seen.bytes += chunk.length));
            this.handler(req, res, seen);
        });
        this.server.on('upgrade', (req, socket, head) => {
            this.upgrades.push(req);
            this.wss.handleUpgrade(req, socket, head, (ws) => ws.send('hello-from-upstream'));
        });
        await new Promise<void>((resolve) => this.server.listen(this.port, '127.0.0.1', resolve));
        // Restarting reuses the port: the gateway's route table keeps the original URL.
        this.port = (this.server.address() as AddressInfo).port;
        this.url = `http://127.0.0.1:${this.port}`;
        return this;
    }

    /** Forget what was seen and restore the default 200 handler. */
    reset(): void {
        this.handler = DEFAULT_HANDLER;
        this.seen.length = 0;
        this.upgrades.length = 0;
    }

    async stop(): Promise<void> {
        this.wss.close();
        this.server.closeAllConnections();
        await new Promise((resolve) => this.server.close(resolve));
    }
}
