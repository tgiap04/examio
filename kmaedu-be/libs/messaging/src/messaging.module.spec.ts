import { AmqpConnection } from './amqp-connection';
import { EventConsumerService } from './event-consumer.service';
import { MESSAGING_DB, MESSAGING_OPTIONS, RELAY_POOL } from './messaging.constants';
import { MessagingModule } from './messaging.module';
import { OutboxPurgeService } from './outbox-purge.service';
import { OutboxRelayService } from './outbox-relay.service';
import { OutboxService } from './outbox.service';
import { RelayPoolCloser } from './relay-pool';

const tokens = (m: ReturnType<typeof MessagingModule.forRoot>) =>
    (m.providers ?? []).map((p: any) => p.provide ?? p);

describe('MessagingModule.forRoot', () => {
    it('API form provides only the outbox (no broker connection, no pool)', () => {
        const t = tokens(MessagingModule.forRoot({ service: 'auth' }));

        expect(t).toEqual([MESSAGING_OPTIONS, OutboxService]);
    });

    it('relay form adds the connection, the pool with its closer, relay and purge', () => {
        const t = tokens(MessagingModule.forRoot({ service: 'auth', relay: true }));

        expect(t).toEqual(
            expect.arrayContaining([AmqpConnection, RELAY_POOL, RelayPoolCloser, OutboxRelayService, OutboxPurgeService])
        );
        expect(t).not.toContain(EventConsumerService);
    });

    it('consume form wires the app DB token and the consumer', () => {
        class Db {}
        const mod = MessagingModule.forRoot({ service: 'finance', consume: { db: Db } });

        expect(tokens(mod)).toEqual(expect.arrayContaining([AmqpConnection, MESSAGING_DB, EventConsumerService]));
        expect((mod.providers as any[]).find((p) => p.provide === MESSAGING_DB).useExisting).toBe(Db);
        expect(mod.exports).toEqual([OutboxService]);
    });
});
