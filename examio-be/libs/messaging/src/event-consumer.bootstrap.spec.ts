import { EventConsumerService } from './event-consumer.service';
import { EventHandler } from './event-handler.decorator';

class Handlers {
    calls: unknown[] = [];

    @EventHandler('auth.user.registered')
    async onRegistered(env: unknown, tx: unknown) {
        this.calls.push([env, tx]);
    }

    @EventHandler('auth.user.authz_changed', { dedupe: false })
    async onAuthz(env: unknown) {
        this.calls.push(env);
    }

    notAHandler() {}
}

class WithGetter {
    get boom(): never {
        throw new Error('getter must not be read');
    }
}

function build(providers: unknown[]) {
    const ch = {
        assertExchange: jest.fn().mockResolvedValue({}),
        assertQueue: jest.fn().mockResolvedValue({}),
        bindQueue: jest.fn().mockResolvedValue({}),
        prefetch: jest.fn().mockResolvedValue(undefined),
        consume: jest.fn().mockResolvedValue({}),
    };
    const amqp = {
        publisher: { publish: jest.fn() },
        createConsumerChannel: jest.fn(),
    };
    const svc = new EventConsumerService(
        { service: 'finance' },
        amqp as never,
        { getProviders: () => providers.map((instance) => ({ instance })) } as never,
        { $transaction: jest.fn() } as never
    );
    return { svc, ch, amqp };
}

describe('EventConsumerService bootstrap', () => {
    it('discovers decorated methods (ignoring getters, null and primitive providers) and binds each key', async () => {
        const h = new Handlers();
        const { svc, ch, amqp } = build([h, new WithGetter(), null, 'str', Object.create(null)]);

        svc.onApplicationBootstrap();
        const setup = amqp.createConsumerChannel.mock.calls[0][0];
        await setup(ch);

        expect(ch.bindQueue.mock.calls.filter((c) => c[1] === 'examio.events')).toEqual([
            ['finance.events', 'examio.events', 'auth.user.registered'],
            ['finance.events', 'examio.events', 'auth.user.authz_changed'],
        ]);
        expect(ch.prefetch).toHaveBeenCalledWith(10);
        expect(ch.consume).toHaveBeenCalledWith('finance.events', expect.any(Function));
    });

    it('routes a delivery from the consume callback to the bound handler', async () => {
        const h = new Handlers();
        const { svc, ch, amqp } = build([h]);
        svc.onApplicationBootstrap();
        await amqp.createConsumerChannel.mock.calls[0][0](ch);
        const spy = jest.spyOn(svc, 'handleMessage').mockResolvedValue(undefined);
        const onMessage = ch.consume.mock.calls[0][1];

        onMessage({ fields: { routingKey: 'x' } });
        onMessage(null); // broker cancel

        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('does not open a consumer channel when no handler exists', () => {
        const { svc, amqp } = build([{}]);

        svc.onApplicationBootstrap();

        expect(amqp.createConsumerChannel).not.toHaveBeenCalled();
    });

    it('dead-letters a message whose routing key has no registered handler', async () => {
        const { svc } = build([]);
        const channel = { ack: jest.fn(), nack: jest.fn() };
        const env = { id: 'evt_x', type: 'auth.other', version: 1, occurredAt: 'now', source: 'auth', correlationId: 'c', data: {} };

        await svc.handleMessage(channel, {
            content: Buffer.from(JSON.stringify(env)),
            fields: { routingKey: 'auth.other' },
            properties: {},
        } as never);

        expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
    });

    it('survives ack/nack failing on a closed channel', async () => {
        const { svc } = build([]);
        svc.registerHandler('auth.user.registered', jest.fn(), { dedupe: false });
        const channel = {
            ack: jest.fn(() => {
                throw new Error('channel closed');
            }),
            nack: jest.fn(),
        };
        const env = { id: 'evt_y', type: 'auth.user.registered', version: 1, occurredAt: 'now', source: 'auth', correlationId: 'c', data: {} };

        await expect(
            svc.handleMessage(channel, {
                content: Buffer.from(JSON.stringify(env)),
                fields: { routingKey: 'auth.user.registered' },
                properties: {},
            } as never)
        ).resolves.toBeUndefined();
    });
});
