import { ClientGrpc } from '@nestjs/microservices';
import { Metadata } from '@grpc/grpc-js';
import { Observable, Subject, TimeoutError, of } from 'rxjs';
import { aiV1 } from '@examio/contracts';
import { AiClient } from './ai.client';
import { QUERY_DEADLINE_MS, STREAM_IDLE_TIMEOUT_MS } from '../config/ai-chat.constants';

const REQUEST: aiV1.StreamChatRequest = { query: 'hi', history: [] };

function setup(service: Partial<Record<'streamChat' | 'query', jest.Mock>>) {
    const serviceMetadata = { attach: jest.fn(async (md: Metadata, _audience: string) => md) };
    const client = new AiClient({ getService: () => service } as unknown as ClientGrpc, serviceMetadata as never);
    client.onModuleInit();
    return { client, serviceMetadata };
}

describe('AiClient', () => {
    afterEach(() => jest.useRealTimers());

    it('queries as a service for the ai audience with a 60 s deadline', async () => {
        const query = jest.fn((..._a: unknown[]) => of({ answer: 'ok', sources: [], timestamp: '1' }));
        const { client, serviceMetadata } = setup({ query });
        const before = Date.now();

        await expect(client.query(REQUEST)).resolves.toMatchObject({ answer: 'ok' });

        expect(serviceMetadata.attach.mock.calls[0][1]).toBe('ai');
        const options = query.mock.calls[0][2] as { deadline: number };
        expect(options.deadline - before).toBeGreaterThanOrEqual(QUERY_DEADLINE_MS - 50);
        expect(options.deadline - before).toBeLessThanOrEqual(QUERY_DEADLINE_MS + 1000);
    });

    it('does not retry a failed query (a model call is never repeated blindly)', async () => {
        const query = jest.fn(() => new Observable<never>((o) => o.error({ code: 14, details: 'down' })));
        const { client } = setup({ query });
        await expect(client.query(REQUEST)).rejects.toMatchObject({ code: 14 });
        expect(query).toHaveBeenCalledTimes(1);
    });

    it('opens the stream under a service token with no deadline', async () => {
        const frames = new Subject<aiV1.StreamChatResponse>();
        const streamChat = jest.fn((..._a: unknown[]) => frames.asObservable());
        const { client, serviceMetadata } = setup({ streamChat });
        const opened = client.streamChat(REQUEST);
        await Promise.resolve();
        await Promise.resolve();
        frames.next({ started: {} });
        (await opened).cancel(); // releases the idle timer

        expect(serviceMetadata.attach.mock.calls[0][1]).toBe('ai');
        expect(streamChat.mock.calls[0]).toHaveLength(2); // (request, metadata): no call options, so no deadline
    });

    it('fails a stream that stays silent before its first frame with a TimeoutError', async () => {
        jest.useFakeTimers();
        const { client } = setup({ streamChat: jest.fn(() => new Subject().asObservable()) });
        const opened = client.streamChat(REQUEST);
        const settled = opened.catch((e: unknown) => e);
        await jest.advanceTimersByTimeAsync(STREAM_IDLE_TIMEOUT_MS + 1);
        expect(await settled).toBeInstanceOf(TimeoutError);
    });

    it('cancels the call and fails the frames when the stream goes idle after it started', async () => {
        jest.useFakeTimers();
        const frames = new Subject<aiV1.StreamChatResponse>();
        let torndown = false;
        const source = new Observable<aiV1.StreamChatResponse>((o) => {
            const inner = frames.subscribe(o);
            return () => {
                torndown = true;
                inner.unsubscribe();
            };
        });
        const { client } = setup({ streamChat: jest.fn(() => source) });
        const opening = client.streamChat(REQUEST);
        await jest.advanceTimersByTimeAsync(0);
        frames.next({ started: {} });
        const stream = await opening;
        let failure: unknown;
        stream.frames.subscribe({ error: (e) => (failure = e) });

        await jest.advanceTimersByTimeAsync(STREAM_IDLE_TIMEOUT_MS - 1);
        expect(failure).toBeUndefined();
        await jest.advanceTimersByTimeAsync(2);
        expect(failure).toBeInstanceOf(TimeoutError);
        expect(torndown).toBe(true);
    });
});
