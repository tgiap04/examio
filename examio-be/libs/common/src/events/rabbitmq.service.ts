import {
    Injectable,
    OnModuleInit,
    OnModuleDestroy,
    Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqp-connection-manager';
import { AmqpConnectionManager, ChannelWrapper } from 'amqp-connection-manager';

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(RabbitMQService.name);
    private connection: AmqpConnectionManager;
    private readonly channels: ChannelWrapper[] = [];

    constructor(private readonly configService: ConfigService) {}

    async onModuleInit() {
        const rabbitUrls = [
            this.configService.get<string>(
                'RABBITMQ_URL',
                'amqp://localhost:5672'
            ),
        ];

        this.connection = amqp.connect(rabbitUrls);

        this.connection.on('connect', () => {
            this.logger.log('Successfully connected to RabbitMQ');
        });

        this.connection.on('disconnect', ({ err }) => {
            this.logger.error('Disconnected from RabbitMQ', err?.stack);
        });
    }

    async onModuleDestroy() {
        // Channels first (awaited), then the connection: closing the connection
        // under a channel that is still closing leaves that close() pending.
        await Promise.allSettled(this.channels.map((c) => c.close()));
        this.channels.length = 0;
        if (this.connection) {
            await this.connection.close();
        }
    }

    getConnection(): AmqpConnectionManager {
        return this.connection;
    }

    /**
     * Every channel gets an `error` listener: ChannelWrapper emits `error` for
     * setup failures and `Channel ended` after a broker reset, and an EventEmitter
     * with no listener turns that into an unhandled crash. Log at warn, never throw.
     */
    createChannel(options: any) {
        const channel = this.connection.createChannel(options);
        channel.on('error', (err: Error, info?: { name?: string }) => {
            this.logger.warn(
                `RabbitMQ channel error${info?.name ? ` (${info.name})` : ''}: ${err?.message ?? err}`
            );
        });
        this.channels.push(channel);
        return channel;
    }
}
