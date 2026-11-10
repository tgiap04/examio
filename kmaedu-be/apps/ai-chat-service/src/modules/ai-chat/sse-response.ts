import type { Response } from 'express';
import { SSE_HEARTBEAT_MS } from '../../config/ai-chat.constants';

/**
 * Manual Server-Sent Events over an Express response.
 *
 * `commit()` is the point of no return: until then a failure can still be a normal JSON error with an
 * HTTP status; afterwards it can only be an `event: error` frame. `signal` aborts when the client goes
 * away before `end()`, which is what cancels the upstream gRPC call.
 */
export class SseResponse {
    private readonly abortController = new AbortController();
    private heartbeat?: NodeJS.Timeout;
    private open = false;
    private finished = false;

    constructor(private readonly res: Response) {
        res.on('close', () => {
            this.stopHeartbeat();
            if (!this.finished && !res.writableFinished) this.abortController.abort();
            this.finished = true;
        });
    }

    get signal(): AbortSignal {
        return this.abortController.signal;
    }

    get committed(): boolean {
        return this.open;
    }

    /** Sends the stream headers (flushed at once, nothing buffers them) and starts the 15 s heartbeat. */
    commit(options: { started: boolean }): void {
        if (this.open || this.finished) return;
        this.open = true;
        this.res.setHeader('Content-Type', 'text/event-stream');
        this.res.setHeader('Cache-Control', 'no-cache, no-transform');
        this.res.setHeader('Connection', 'keep-alive');
        this.res.setHeader('X-Accel-Buffering', 'no');
        this.res.flushHeaders();
        if (options.started) this.send({ type: 'started' });
        this.heartbeat = setInterval(() => this.write(': hb\n\n'), SSE_HEARTBEAT_MS);
        this.heartbeat.unref();
    }

    send(event: object): void {
        this.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    /** `event: error` frame; its data line keeps the `{type:'error', data}` shape the web client reads. */
    fail(message: string): void {
        this.write(`event: error\ndata: ${JSON.stringify({ type: 'error', data: message })}\n\n`);
    }

    end(): void {
        if (this.finished) return;
        this.stopHeartbeat();
        if (this.open) {
            this.finished = true;
            this.res.end();
        }
    }

    private write(chunk: string): void {
        if (!this.open || this.finished) return;
        this.res.write(chunk);
    }

    private stopHeartbeat(): void {
        if (this.heartbeat) clearInterval(this.heartbeat);
        this.heartbeat = undefined;
    }
}
