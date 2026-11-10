import { declareTopology, topologyNames } from './topology';

describe('declareTopology', () => {
    it('declares the exchanges, queues and bindings with the exact arguments', async () => {
        const ch = {
            assertExchange: jest.fn().mockResolvedValue({}),
            assertQueue: jest.fn().mockResolvedValue({}),
            bindQueue: jest.fn().mockResolvedValue({}),
        };

        const names = await declareTopology(ch, 'finance');

        expect(names).toEqual(topologyNames('finance'));
        expect(ch.assertExchange.mock.calls).toEqual([
            ['kmaedu.events', 'topic', { durable: true }],
            ['finance.retry', 'fanout', { durable: true }],
            ['finance.requeue', 'fanout', { durable: true }],
            ['finance.dead', 'fanout', { durable: true }],
        ]);
        expect(ch.assertQueue.mock.calls).toEqual([
            ['finance.events', { durable: true, arguments: { 'x-dead-letter-exchange': 'finance.dead' } }],
            [
                'finance.retry.30s',
                {
                    durable: true,
                    arguments: { 'x-message-ttl': 30000, 'x-dead-letter-exchange': 'finance.requeue' },
                },
            ],
            ['finance.dlq', { durable: true }],
        ]);
        expect(ch.bindQueue.mock.calls).toEqual([
            ['finance.retry.30s', 'finance.retry', ''],
            ['finance.events', 'finance.requeue', ''],
            ['finance.dlq', 'finance.dead', ''],
        ]);
    });

    it('never sets a dead-letter routing key (the original key must survive)', async () => {
        const ch = {
            assertExchange: jest.fn().mockResolvedValue({}),
            assertQueue: jest.fn().mockResolvedValue({}),
            bindQueue: jest.fn().mockResolvedValue({}),
        };
        await declareTopology(ch, 'auth');
        const args = JSON.stringify(ch.assertQueue.mock.calls);
        expect(args).not.toContain('x-dead-letter-routing-key');
    });
});
