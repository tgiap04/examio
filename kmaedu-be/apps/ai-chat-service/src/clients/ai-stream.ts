import { Observable, ReplaySubject } from 'rxjs';

export interface OpenedStream<T> {
    /** Every frame from the first one on: the frame that opened the stream is replayed. */
    frames: Observable<T>;
    /** Cancels the underlying call (the server sees CANCELLED). Safe to call more than once. */
    cancel(): void;
}

/**
 * Subscribes to a server-streaming call and resolves once its FIRST frame arrived. A failure before
 * that frame (the status of the call itself: refused token, exhausted capacity, down) rejects, so the
 * caller can still answer the HTTP request with a proper status; anything later flows through `frames`.
 * Frames received while the caller is getting ready are buffered, not lost.
 */
export function openStream<T>(source: Observable<T>): Promise<OpenedStream<T>> {
    return new Promise((resolve, reject) => {
        const buffer = new ReplaySubject<T>();
        let opened = false;
        const open = (): void => {
            if (opened) return;
            opened = true;
            resolve({ frames: buffer.asObservable(), cancel: () => upstream.unsubscribe() });
        };
        const upstream = source.subscribe({
            next: (frame) => {
                buffer.next(frame);
                open();
            },
            error: (error: unknown) => {
                if (opened) buffer.error(error);
                else reject(error);
            },
            complete: () => {
                buffer.complete();
                open();
            },
        });
    });
}
