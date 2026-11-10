import { Observable, Subject } from 'rxjs';
import { openStream } from './ai-stream';

/** A source whose teardown is observable. */
function tracked<T>() {
    const subject = new Subject<T>();
    let subscribers = 0;
    let torndown = 0;
    const source = new Observable<T>((observer) => {
        subscribers++;
        const inner = subject.subscribe(observer);
        return () => {
            torndown++;
            inner.unsubscribe();
        };
    });
    return { subject, source, stats: () => ({ subscribers, torndown }) };
}

function collect<T>(frames: Observable<T>) {
    const seen: T[] = [];
    const state: { error?: unknown; completed: boolean } = { completed: false };
    frames.subscribe({
        next: (v) => seen.push(v),
        error: (e) => (state.error = e),
        complete: () => (state.completed = true),
    });
    return { seen, state };
}

describe('openStream', () => {
    it('resolves at the first frame and replays it to the subscriber, then forwards the rest', async () => {
        const { subject, source } = tracked<string>();
        const opened = openStream(source);
        subject.next('started');
        const { frames } = await opened;
        subject.next('chunk-1');
        const got = collect(frames);
        subject.next('chunk-2');
        subject.complete();
        expect(got.seen).toEqual(['started', 'chunk-1', 'chunk-2']);
        expect(got.state.completed).toBe(true);
    });

    it('rejects when the call fails before the first frame (the caller can still answer with an HTTP status)', async () => {
        const { subject, source } = tracked<string>();
        const opened = openStream(source);
        subject.error({ code: 7 });
        await expect(opened).rejects.toEqual({ code: 7 });
    });

    it('delivers a failure after the first frame through the frames', async () => {
        const { subject, source } = tracked<string>();
        const opened = openStream(source);
        subject.next('started');
        const { frames } = await opened;
        const got = collect(frames);
        subject.error(new Error('boom'));
        expect(got.seen).toEqual(['started']);
        expect(got.state.error).toEqual(new Error('boom'));
    });

    it('resolves with an already completed stream when the call ends without a frame', async () => {
        const { subject, source } = tracked<string>();
        const opened = openStream(source);
        subject.complete();
        const got = collect((await opened).frames);
        expect(got.seen).toEqual([]);
        expect(got.state.completed).toBe(true);
    });

    it('cancel tears the call down exactly once, even when called twice', async () => {
        const { subject, source, stats } = tracked<string>();
        const opened = openStream(source);
        subject.next('started');
        const stream = await opened;
        stream.cancel();
        stream.cancel();
        expect(stats()).toEqual({ subscribers: 1, torndown: 1 });
    });
});
