import { EventConsumerService } from './event-consumer.service';
import { createEnvelope, Envelope } from './envelope';
import { PermanentEventError } from './errors';

const KEY = 'auth.user.registered';

function build() {
    const tx = {
        processedEvent: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const db = {
        $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const publisher = { publish: jest.fn().mockResolvedValue(true) };
    const amqp = { publisher, createConsumerChannel: jest.fn() };
    const channel = { ack: jest.fn(), nack: jest.fn() };
    const svc = new EventConsumerService(
        { service: 'finance' },
        amqp as never,
        { getProviders: () => [] } as never,
        db as never
    );
    return { svc, tx, db, publisher, channel };
}

function message(
    env: Envelope | Record<string, unknown>,
    opts: { routingKey?: string; retry?: number } = {}
) {
    return {
        content: Buffer.from(JSON.stringify(env)),
        fields: { routingKey: opts.routingKey ?? KEY, deliveryTag: 1 },
        properties: {
            messageId: (env as Envelope).id,
            headers:
                opts.retry === undefined
                    ? {}
                    : { 'x-retry-count': opts.retry },
        },
    } as never;
}

const envelope = () =>
    createEnvelope(KEY, { userId: 'u1' }, { source: 'auth' });

describe('EventConsumerService.handleMessage', () => {
    it('runs the handler with (envelope, tx) in the dedupe tx, then acks', async () => {
        const { svc, tx, channel } = build();
        const handler = jest.fn().mockResolvedValue(undefined);
        svc.registerHandler(KEY, handler, {});
        const env = envelope();

        await svc.handleMessage(channel, message(env));

        expect(tx.processedEvent.createMany).toHaveBeenCalledWith({
            data: [{ consumer: 'finance', eventId: env.id }],
            skipDuplicates: true,
        });
        expect(handler).toHaveBeenCalledWith(env, tx);
        expect(channel.ack).toHaveBeenCalledTimes(1);
        expect(channel.nack).not.toHaveBeenCalled();
    });

    it('acks a duplicate id without calling the handler', async () => {
        const { svc, tx, channel } = build();
        tx.processedEvent.createMany.mockResolvedValue({ count: 0 });
        const handler = jest.fn();
        svc.registerHandler(KEY, handler, {});

        await svc.handleMessage(channel, message(envelope()));

        expect(handler).not.toHaveBeenCalled();
        expect(channel.ack).toHaveBeenCalledTimes(1);
    });

    it('republishes a transient failure to <svc>.retry with the original key, then acks', async () => {
        const { svc, publisher, channel } = build();
        svc.registerHandler(KEY, jest.fn().mockRejectedValue(new Error('db down')), {});

        await svc.handleMessage(channel, message(envelope(), { retry: 0 }));

        expect(publisher.publish).toHaveBeenCalledTimes(1);
        const [exchange, key, , options] = publisher.publish.mock.calls[0];
        expect(exchange).toBe('finance.retry');
        expect(key).toBe(KEY);
        expect(options.headers['x-retry-count']).toBe(1);
        expect(options.persistent).toBe(true);
        expect(channel.ack).toHaveBeenCalledTimes(1);
        expect(channel.nack).not.toHaveBeenCalled();
    });

    it('dead-letters once the retry count reaches 5', async () => {
        const { svc, publisher, channel } = build();
        svc.registerHandler(KEY, jest.fn().mockRejectedValue(new Error('x')), {});

        await svc.handleMessage(channel, message(envelope(), { retry: 5 }));

        expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
        expect(publisher.publish).not.toHaveBeenCalled();
        expect(channel.ack).not.toHaveBeenCalled();
    });

    it('dead-letters a PermanentEventError immediately', async () => {
        const { svc, publisher, channel } = build();
        svc.registerHandler(
            KEY,
            jest.fn().mockRejectedValue(new PermanentEventError('BAD_DATA')),
            {}
        );

        await svc.handleMessage(channel, message(envelope(), { retry: 0 }));

        expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
        expect(publisher.publish).not.toHaveBeenCalled();
    });

    it('dead-letters a source that disagrees with the routing key without calling the handler', async () => {
        const { svc, channel } = build();
        const handler = jest.fn();
        svc.registerHandler(KEY, handler, {});
        const forged = { ...envelope(), source: 'exam' };

        await svc.handleMessage(channel, message(forged));

        expect(handler).not.toHaveBeenCalled();
        expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
    });

    it('dead-letters a type that disagrees with the routing key', async () => {
        const { svc, channel } = build();
        const handler = jest.fn();
        svc.registerHandler(KEY, handler, {});
        const other = createEnvelope('auth.user.deleted', {}, { source: 'auth' });

        await svc.handleMessage(channel, message(other, { routingKey: KEY }));

        expect(handler).not.toHaveBeenCalled();
        expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
    });

    it('dead-letters an unparseable body', async () => {
        const { svc, channel } = build();
        svc.registerHandler(KEY, jest.fn(), {});
        const raw = {
            content: Buffer.from('not json'),
            fields: { routingKey: KEY, deliveryTag: 1 },
            properties: { headers: {} },
        } as never;

        await svc.handleMessage(channel, raw);

        expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
    });

    it('dedupe:false handler gets only the envelope and writes no processed_events', async () => {
        const { svc, tx, db, channel } = build();
        const handler = jest.fn().mockResolvedValue(undefined);
        svc.registerHandler(KEY, handler, { dedupe: false });
        const env = envelope();

        await svc.handleMessage(channel, message(env));

        expect(handler).toHaveBeenCalledWith(env);
        expect(db.$transaction).not.toHaveBeenCalled();
        expect(tx.processedEvent.createMany).not.toHaveBeenCalled();
        expect(channel.ack).toHaveBeenCalledTimes(1);
    });

    it('requeues only when the retry publish itself fails', async () => {
        const { svc, publisher, channel } = build();
        publisher.publish.mockRejectedValue(new Error('broker gone'));
        svc.registerHandler(KEY, jest.fn().mockRejectedValue(new Error('x')), {});

        await svc.handleMessage(channel, message(envelope(), { retry: 1 }));

        expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, true);
        expect(channel.ack).not.toHaveBeenCalled();
    });
});
