import { Inject, Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import {
    AmqpConnectionManager,
    ChannelWrapper,
    connect,
} from 'amqp-connection-manager';
import type { ConfirmChannel } from 'amqplib';
import { MESSAGING_OPTIONS, MessagingServiceOptions } from './messaging.constants';
import { declareTopology } from './topology';

const CLOSE_TIMEOUT_MS = 5000;

/** Shutdown must never hang on a broker that is already gone. */
async function withTimeout(work: Promise<unknown>, ms: number): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise((resolve) => {
        timer = setTimeout(resolve, ms);
    });
    try {
        await Promise.race([work.catch(() => undefined), timeout]);
    } finally {
        clearTimeout(timer);
    }
}

/** Anything that can publish a raw message and resolve on broker confirm. */
export interface ConfirmPublisher {
    publish(
        exchange: string,
        routingKey: string,
        content: Buffer,
        options: Record<string, unknown>
    ): Promise<unknown>;
}

/**
 * One AMQP connection per process plus one confirm channel for publishing
 * (outbox relay, consumer retry). Connecting never blocks boot: the manager
 * retries in the background, so an API process is unaffected by a broker outage.
 */
@Injectable()
export class AmqpConnection implements OnApplicationShutdown {
    private readonly logger = new Logger(AmqpConnection.name);
    private readonly manager: AmqpConnectionManager;
    private readonly publisherChannel: ChannelWrapper;
    private readonly consumerChannels: ChannelWrapper[] = [];

    constructor(
        @Inject(MESSAGING_OPTIONS) private readonly options: MessagingServiceOptions
    ) {
        const url = process.env.RABBITMQ_URL;
        if (!url) throw new Error('RABBITMQ_URL is required');
        // Retry fast: the outbox backlog should flush within seconds of the broker returning.
        this.manager = connect([url], { reconnectTimeInSeconds: 1 });
        this.manager.on('connect', () =>
            this.logger.log(`AMQP connected (${this.options.service})`)
        );
        this.manager.on('disconnect', ({ err }) =>
            this.logger.warn(`AMQP disconnected: ${err?.message ?? 'unknown'}`)
        );
        this.publisherChannel = this.manager.createChannel({
            json: false,
            setup: (ch: ConfirmChannel) =>
                declareTopology(ch, this.options.service),
        });
    }

    get publisher(): ConfirmPublisher {
        return this.publisherChannel;
    }

    isConnected(): boolean {
        return this.manager.isConnected();
    }

    /** A dedicated channel for consuming; `setup` runs on every (re)connect. */
    createConsumerChannel(
        setup: (ch: ConfirmChannel) => Promise<void>
    ): ChannelWrapper {
        const channel = this.manager.createChannel({ json: false, setup });
        this.consumerChannels.push(channel);
        return channel;
    }

    async onApplicationShutdown(): Promise<void> {
        // Channels first, then the connection: closing the connection under a
        // channel that is still closing leaves that close() pending forever.
        for (const channel of [...this.consumerChannels, this.publisherChannel]) {
            await withTimeout(channel.close(), CLOSE_TIMEOUT_MS);
        }
        await withTimeout(this.manager.close(), CLOSE_TIMEOUT_MS);
    }
}
