import { connect, type ChannelModel, type ConfirmChannel } from 'amqplib';
import { createEnvelope, EVENTS_EXCHANGE } from '@examio/messaging';

/** A publisher connected as one broker user (the real permissions apply: `ai` may publish `ai.*` only). */
export interface TestPublisher {
    publish(type: string, data: unknown, source?: string): Promise<{ id: string }>;
    close(): Promise<void>;
}

export async function connectPublisher(url: string): Promise<TestPublisher> {
    const conn: ChannelModel = await connect(url);
    conn.on('error', () => undefined);
    const ch: ConfirmChannel = await conn.createConfirmChannel();
    // A refused publish closes the channel with ACCESS_REFUSED: surface it as a rejected publish.
    let closed: Error | undefined;
    const onClosed: Array<(error: Error) => void> = [];
    ch.on('error', (error: Error) => {
        closed = error;
        onClosed.forEach((fn) => fn(error));
    });
    return {
        async publish(type, data, source = type.split('.')[0]) {
            const envelope = createEnvelope(type, data, { source });
            if (closed) throw closed;
            await new Promise<void>((resolve, reject) => {
                onClosed.push(reject);
                ch.publish(
                    EVENTS_EXCHANGE,
                    type,
                    Buffer.from(JSON.stringify(envelope)),
                    { persistent: true, messageId: envelope.id, contentType: 'application/json' },
                    (err) => (err ? reject(err) : resolve())
                );
            });
            return { id: envelope.id };
        },
        async close() {
            await ch.close().catch(() => undefined);
            await conn.close().catch(() => undefined);
        },
    };
}

/** Polls `read` until it returns a truthy value (≤ `timeoutMs`); fails with the last value otherwise. */
export async function eventually<T>(read: () => Promise<T | null | undefined | false>, timeoutMs = 20_000, stepMs = 150): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const value = await read();
        if (value) return value;
        if (Date.now() > deadline) throw new Error(`condition not met within ${timeoutMs} ms`);
        await new Promise((resolve) => setTimeout(resolve, stepMs));
    }
}
