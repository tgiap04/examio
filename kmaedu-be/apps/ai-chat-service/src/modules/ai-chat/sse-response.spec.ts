import { EventEmitter } from 'events';
import type { Response } from 'express';
import { SseResponse } from './sse-response';
import { SSE_HEARTBEAT_MS } from '../../config/ai-chat.constants';

class FakeRes extends EventEmitter {
    headers: Record<string, string> = {};
    written: string[] = [];
    writableFinished = false;
    headersFlushed = false;
    setHeader = (k: string, v: string) => void (this.headers[k] = v);
    flushHeaders = () => void (this.headersFlushed = true);
    write = (chunk: string) => {
        this.written.push(chunk);
        return true;
    };
    end = () => {
        this.writableFinished = true;
        this.emit('close');
    };
    get body() {
        return this.written.join('');
    }
}

const make = () => {
    const res = new FakeRes();
    return { res, sse: new SseResponse(res as unknown as Response) };
};

describe('SseResponse', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('commits the event-stream headers (no buffering anywhere) and the started frame', () => {
        const { res, sse } = make();
        expect(sse.committed).toBe(false);
        sse.commit({ started: true });
        expect(sse.committed).toBe(true);
        expect(res.headers).toMatchObject({
            'Content-Type': 'text/event-stream',
            'X-Accel-Buffering': 'no',
        });
        expect(res.headers['Cache-Control']).toContain('no-cache');
        expect(res.headersFlushed).toBe(true);
        expect(res.body).toBe('data: {"type":"started"}\n\n');
        sse.end();
    });

    it('does not write a started frame unless asked (regenerate-stream)', () => {
        const { res, sse } = make();
        sse.commit({ started: false });
        expect(res.body).toBe('');
        sse.end();
    });

    it('commit is idempotent', () => {
        const { res, sse } = make();
        sse.commit({ started: true });
        sse.commit({ started: true });
        expect(res.body.match(/started/g)).toHaveLength(1);
        sse.end();
    });

    it('sends data frames and an error as an `event: error` frame whose data line keeps the legacy shape', () => {
        const { res, sse } = make();
        sse.commit({ started: false });
        sse.send({ type: 'chunk', data: 'hel' });
        sse.fail('boom');
        expect(res.body).toBe(
            'data: {"type":"chunk","data":"hel"}\n\n' + 'event: error\ndata: {"type":"error","data":"boom"}\n\n'
        );
        sse.end();
    });

    it('writes a `: hb` comment every 15 s while open and none after the end', () => {
        const { res, sse } = make();
        sse.commit({ started: false });
        jest.advanceTimersByTime(SSE_HEARTBEAT_MS - 1);
        expect(res.body).toBe('');
        jest.advanceTimersByTime(1);
        expect(res.body).toBe(': hb\n\n');
        jest.advanceTimersByTime(SSE_HEARTBEAT_MS);
        expect(res.body).toBe(': hb\n\n: hb\n\n');
        sse.end();
        jest.advanceTimersByTime(SSE_HEARTBEAT_MS * 3);
        expect(res.body).toBe(': hb\n\n: hb\n\n');
    });

    it('aborts the signal when the client goes away, and stops writing', () => {
        const { res, sse } = make();
        sse.commit({ started: false });
        const aborted = jest.fn();
        sse.signal.addEventListener('abort', aborted);
        res.emit('close'); // the socket closed before we ended the response
        expect(aborted).toHaveBeenCalledTimes(1);
        sse.send({ type: 'chunk', data: 'late' });
        expect(res.body).toBe('');
        jest.advanceTimersByTime(SSE_HEARTBEAT_MS * 2);
        expect(res.body).toBe('');
    });

    it('does not abort when the close comes from our own end()', () => {
        const { sse } = make();
        sse.commit({ started: false });
        sse.end();
        expect(sse.signal.aborted).toBe(false);
    });

    it('an abort before the commit is still seen', () => {
        const { res, sse } = make();
        res.emit('close');
        expect(sse.signal.aborted).toBe(true);
    });
});
