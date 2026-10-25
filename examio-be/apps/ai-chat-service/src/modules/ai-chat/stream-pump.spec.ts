import { Subject } from 'rxjs';
import { aiV1 } from '@examio/contracts';
import { pumpFrames, type Frame } from './stream-pump';

const frame = (f: Partial<aiV1.StreamChatResponse>): aiV1.StreamChatResponse => f as aiV1.StreamChatResponse;

function run() {
    const frames = new Subject<aiV1.StreamChatResponse>();
    const controller = new AbortController();
    const sent: Frame[] = [];
    const cancel = jest.fn();
    const result = pumpFrames({ frames: frames.asObservable(), cancel }, controller.signal, (f) => sent.push(f));
    return { frames, controller, sent, cancel, result };
}

describe('pumpFrames', () => {
    it('forwards chunks, accumulates the text and finishes on `done`', async () => {
        const { frames, sent, cancel, result } = run();
        frames.next(frame({ started: {} }));
        frames.next(frame({ chunk: 'Hel' }));
        frames.next(frame({ chunk: 'lo' }));
        frames.next(frame({ done: { assistantMessage: { role: 'assistant', content: 'Hello' }, createdAt: '1', sources: [] } }));
        await expect(result).resolves.toEqual({ outcome: 'done', text: 'Hello', finalText: 'Hello' });
        expect(cancel).not.toHaveBeenCalled(); // the call ended by itself: nothing to cancel
        expect(sent).toEqual([
            { type: 'chunk', data: 'Hel' },
            { type: 'chunk', data: 'lo' },
        ]);
    });

    it('keeps the partial text when ai-service reports an in-band error', async () => {
        const { frames, result } = run();
        frames.next(frame({ chunk: 'par' }));
        frames.next(frame({ error: { message: 'model fell over (ref abc)', code: 'MODEL_RUNTIME_ERROR' } }));
        await expect(result).resolves.toEqual({ outcome: 'error', text: 'par', message: 'model fell over (ref abc)' });
    });

    it('turns a transport failure into an error outcome without leaking its text', async () => {
        const { frames, result } = run();
        frames.next(frame({ chunk: 'x' }));
        frames.error({ code: 14, details: 'secret internals' });
        const outcome = await result;
        expect(outcome).toMatchObject({ outcome: 'error', text: 'x' });
        expect(JSON.stringify(outcome)).not.toContain('secret internals');
    });

    it('treats a stream that just ends as done with what it has', async () => {
        const { frames, result } = run();
        frames.next(frame({ chunk: 'abc' }));
        frames.complete();
        await expect(result).resolves.toEqual({ outcome: 'done', text: 'abc', finalText: undefined });
    });

    it('on client abort cancels the call and reports the partial text', async () => {
        const { frames, controller, cancel, result, sent } = run();
        frames.next(frame({ chunk: 'part' }));
        controller.abort();
        await expect(result).resolves.toEqual({ outcome: 'aborted', text: 'part' });
        expect(cancel).toHaveBeenCalledTimes(1);
        frames.next(frame({ chunk: 'ignored' }));
        expect(sent).toEqual([{ type: 'chunk', data: 'part' }]);
    });

    it('sees an abort that happened before the pump started', async () => {
        const frames = new Subject<aiV1.StreamChatResponse>();
        const controller = new AbortController();
        controller.abort();
        const cancel = jest.fn();
        await expect(pumpFrames({ frames, cancel }, controller.signal, jest.fn())).resolves.toMatchObject({ outcome: 'aborted' });
        expect(cancel).toHaveBeenCalled();
    });

    it('recognises frames by the loader `event` marker as well as by their field', async () => {
        const { frames, sent, result } = run();
        frames.next({ event: 'chunk', chunk: 'a', started: undefined, done: undefined, error: undefined } as never);
        frames.next({ event: 'done', done: { assistantMessage: { role: 'assistant', content: 'a' } } } as never);
        await expect(result).resolves.toMatchObject({ outcome: 'done', text: 'a' });
        expect(sent).toEqual([{ type: 'chunk', data: 'a' }]);
    });
});
