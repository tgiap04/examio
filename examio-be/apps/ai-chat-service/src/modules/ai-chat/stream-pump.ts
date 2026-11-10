import { aiV1 } from '@examio/contracts';
import type { OpenedStream } from '../../clients/ai-stream';
import { toAiHttpException } from '../../clients/ai-errors';

/** The only frame a client is sent while the answer is being produced. */
export interface Frame {
    type: 'chunk';
    data: string;
}

export type PumpResult =
    | { outcome: 'done'; text: string; finalText: string | undefined }
    | { outcome: 'error'; text: string; message: string }
    | { outcome: 'aborted'; text: string };

type Kind = 'started' | 'chunk' | 'done' | 'error';

/** Which member of the `event` oneof a frame carries (the loader's `event` marker, else the field itself). */
function kindOf(frame: aiV1.StreamChatResponse): Kind | undefined {
    const marker = (frame as { event?: unknown }).event;
    if (marker === 'started' || marker === 'chunk' || marker === 'done' || marker === 'error') return marker;
    if (frame.chunk !== undefined) return 'chunk';
    if (frame.done) return 'done';
    if (frame.error) return 'error';
    if (frame.started) return 'started';
    return undefined;
}

/**
 * Drives one ai-service stream to its end: chunks are forwarded through `send` as they arrive and
 * accumulated. Settles on `done`, an in-band `error`, a transport failure (idle timeout included), the
 * end of the stream, or `signal` aborting (the client left): then the call is cancelled and the
 * text so far is reported. Never rejects.
 */
export function pumpFrames(
    stream: OpenedStream<aiV1.StreamChatResponse>,
    signal: AbortSignal,
    send: (frame: Frame) => void
): Promise<PumpResult> {
    return new Promise((resolve) => {
        let text = '';
        let settled = false;
        let subscription: { unsubscribe(): void } | undefined;

        const settle = (result: PumpResult): void => {
            if (settled) return;
            settled = true;
            signal.removeEventListener('abort', onAbort);
            subscription?.unsubscribe();
            resolve(result);
        };
        const onAbort = (): void => {
            stream.cancel();
            settle({ outcome: 'aborted', text });
        };

        if (signal.aborted) return onAbort();
        signal.addEventListener('abort', onAbort, { once: true });
        subscription = stream.frames.subscribe({
            next: (frame) => {
                switch (kindOf(frame)) {
                    case 'chunk':
                        text += frame.chunk ?? '';
                        send({ type: 'chunk', data: frame.chunk ?? '' });
                        break;
                    case 'done':
                        settle({ outcome: 'done', text, finalText: frame.done?.assistantMessage?.content });
                        break;
                    case 'error':
                        settle({ outcome: 'error', text, message: frame.error?.message || 'AI gặp lỗi khi trả lời.' });
                        break;
                    default:
                        break; // `started`: nothing to forward
                }
            },
            error: (error: unknown) => {
                const { message } = toAiHttpException(error).getResponse() as { message: string };
                settle({ outcome: 'error', text, message });
            },
            complete: () => settle({ outcome: 'done', text, finalText: undefined }),
        });
        // `settle` may have run synchronously (a replayed terminal frame) before `subscription` was set.
        if (settled) subscription.unsubscribe();
    });
}
