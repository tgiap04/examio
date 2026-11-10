import {
    Inject,
    Injectable,
    Logger,
    OnApplicationBootstrap,
} from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { AmqpConnection } from './amqp-connection';
import { domainOf, Envelope, parseEnvelope } from './envelope';
import {
    EVENT_HANDLER_METADATA,
    EventHandlerMetadata,
    EventHandlerOptions,
} from './event-handler.decorator';
import { PermanentEventError } from './errors';
import { MESSAGING_DB, MESSAGING_OPTIONS, MessagingServiceOptions } from './messaging.constants';
import { declareTopology, EVENTS_EXCHANGE, MAX_RETRIES, PREFETCH, topologyNames } from './topology';

/** Structural slice of a Prisma client/tx used for the idempotency record. */
export interface MessagingTx {
    processedEvent: {
        createMany(args: {
            data: { consumer: string; eventId: string }[];
            skipDuplicates: boolean;
        }): Promise<{ count: number }>;
    };
}

export interface MessagingDb {
    $transaction<R>(fn: (tx: MessagingTx) => Promise<R>): Promise<R>;
}

export interface ConsumerChannel {
    ack(msg: ConsumeMessage): void;
    nack(msg: ConsumeMessage, allUpTo?: boolean, requeue?: boolean): void;
}

type Handler = (envelope: Envelope, tx?: MessagingTx) => Promise<unknown>;

interface Registered {
    handler: Handler;
    dedupe: boolean;
}

@Injectable()
export class EventConsumerService implements OnApplicationBootstrap {
    private readonly logger = new Logger(EventConsumerService.name);
    private readonly handlers = new Map<string, Registered>();

    constructor(
        @Inject(MESSAGING_OPTIONS) private readonly options: MessagingServiceOptions,
        private readonly amqp: AmqpConnection,
        private readonly discovery: DiscoveryService,
        @Inject(MESSAGING_DB) private readonly db: MessagingDb
    ) {}

    registerHandler(type: string, handler: Handler, options: EventHandlerOptions): void {
        this.handlers.set(type, { handler, dedupe: options.dedupe !== false });
    }

    onApplicationBootstrap(): void {
        this.discoverHandlers();
        const keys = [...this.handlers.keys()];
        if (keys.length === 0) {
            this.logger.warn(`No @EventHandler found for ${this.options.service}; not consuming`);
            return;
        }
        const names = topologyNames(this.options.service);
        // AmqpConnection owns the channel's lifecycle (closes it before the connection).
        this.amqp.createConsumerChannel(async (ch: ConfirmChannel) => {
            await declareTopology(ch, this.options.service);
            for (const key of keys) await ch.bindQueue(names.events, EVENTS_EXCHANGE, key);
            await ch.prefetch(PREFETCH);
            await ch.consume(names.events, (msg) => {
                if (msg) void this.handleMessage(ch, msg);
            });
        });
    }

    private discoverHandlers(): void {
        for (const wrapper of this.discovery.getProviders()) {
            const instance = wrapper.instance as Record<string, unknown> | null;
            if (!instance || typeof instance !== 'object') continue;
            const proto = Object.getPrototypeOf(instance);
            if (!proto) continue;
            for (const name of Object.getOwnPropertyNames(proto)) {
                // Read the descriptor, never the property: some providers
                // expose throwing getters on their prototype.
                const fn = Object.getOwnPropertyDescriptor(proto, name)?.value;
                if (typeof fn !== 'function') continue;
                const meta: EventHandlerMetadata | undefined = Reflect.getMetadata(
                    EVENT_HANDLER_METADATA,
                    fn
                );
                if (meta) this.registerHandler(meta.type, fn.bind(instance), meta.options);
            }
        }
    }

    /** Processes one delivery; always settles it (ack, retry-then-ack, or nack to the DLQ). */
    async handleMessage(ch: ConsumerChannel, msg: ConsumeMessage): Promise<void> {
        const routingKey = msg.fields.routingKey;
        let envelope: Envelope | undefined;
        try {
            envelope = this.validate(routingKey, msg);
            const entry = this.handlers.get(routingKey);
            if (!entry) throw new PermanentEventError('NO_HANDLER', `No handler for ${routingKey}`);
            await this.run(entry, envelope);
            this.settle(() => ch.ack(msg));
        } catch (err) {
            await this.fail(ch, msg, envelope, err);
        }
    }

    private validate(routingKey: string, msg: ConsumeMessage): Envelope {
        let raw: unknown;
        try {
            raw = JSON.parse(msg.content.toString());
        } catch {
            throw new PermanentEventError('INVALID_JSON', 'Body is not valid JSON');
        }
        const envelope = parseEnvelope(raw);
        if (envelope.type !== routingKey || envelope.source !== domainOf(routingKey)) {
            this.logger.error(
                `SOURCE_MISMATCH id=${envelope.id} type=${envelope.type} source=${envelope.source} routingKey=${routingKey}`
            );
            throw new PermanentEventError('SOURCE_MISMATCH', 'Envelope disagrees with routing key');
        }
        return envelope;
    }

    private async run(entry: Registered, envelope: Envelope): Promise<void> {
        if (!entry.dedupe) {
            await entry.handler(envelope);
            return;
        }
        await this.db.$transaction(async (tx) => {
            const { count } = await tx.processedEvent.createMany({
                data: [{ consumer: this.options.service, eventId: envelope.id }],
                skipDuplicates: true,
            });
            if (count === 0) {
                this.logger.debug(`Duplicate delivery skipped id=${envelope.id}`);
                return;
            }
            await entry.handler(envelope, tx);
        });
    }

    private async fail(
        ch: ConsumerChannel,
        msg: ConsumeMessage,
        envelope: Envelope | undefined,
        err: unknown
    ): Promise<void> {
        const ref = `id=${envelope?.id ?? msg.properties.messageId} type=${envelope?.type ?? msg.fields.routingKey}`;
        const retries = Number(msg.properties.headers?.['x-retry-count'] ?? 0);
        if (err instanceof PermanentEventError || retries >= MAX_RETRIES) {
            const reason = err instanceof PermanentEventError ? err.code : 'RETRIES_EXHAUSTED';
            this.logger.error(`Dead-lettering ${ref} reason=${reason}`);
            this.settle(() => ch.nack(msg, false, false));
            return;
        }
        this.logger.warn(`Retry ${retries + 1}/${MAX_RETRIES} ${ref}: ${(err as Error).message}`);
        try {
            await this.amqp.publisher.publish(
                topologyNames(this.options.service).retryExchange,
                msg.fields.routingKey,
                msg.content,
                {
                    persistent: true,
                    messageId: msg.properties.messageId,
                    contentType: msg.properties.contentType ?? 'application/json',
                    headers: { 'x-retry-count': retries + 1 },
                }
            );
            this.settle(() => ch.ack(msg));
        } catch (publishErr) {
            // The retry copy was not confirmed: give the original back to the queue.
            this.logger.error(`Retry publish failed ${ref}: ${(publishErr as Error).message}`);
            this.settle(() => ch.nack(msg, false, true));
        }
    }

    /** A closed channel throws on ack/nack; the broker redelivers and dedupe absorbs it. */
    private settle(action: () => void): void {
        try {
            action();
        } catch (err) {
            this.logger.warn(`Could not settle delivery: ${(err as Error).message}`);
        }
    }
}
