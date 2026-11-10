import { DynamicModule, Module, Provider } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { AmqpConnection } from './amqp-connection';
import { EventConsumerService } from './event-consumer.service';
import {
    MESSAGING_DB,
    MESSAGING_OPTIONS,
    MessagingModuleOptions,
    RELAY_POOL,
} from './messaging.constants';
import { OutboxPurgeService } from './outbox-purge.service';
import { OutboxRelayService } from './outbox-relay.service';
import { OutboxService } from './outbox.service';
import { createRelayPool, RelayPoolCloser } from './relay-pool';

@Module({})
export class MessagingModule {
    /**
     * Always provides `OutboxService` (needs no broker connection, so an API
     * process is unaffected by a broker outage). `relay` and `consume` add the
     * worker-role pieces.
     */
    static forRoot(options: MessagingModuleOptions): DynamicModule {
        const providers: Provider[] = [
            { provide: MESSAGING_OPTIONS, useValue: options },
            OutboxService,
        ];
        const imports: DynamicModule['imports'] = [];

        if (options.relay || options.consume) providers.push(AmqpConnection);
        if (options.relay) {
            providers.push(
                {
                    provide: RELAY_POOL,
                    useFactory: () => createRelayPool(),
                },
                RelayPoolCloser,
                OutboxRelayService,
                OutboxPurgeService
            );
        }
        if (options.consume) {
            imports.push(DiscoveryModule);
            providers.push(
                {
                    provide: MESSAGING_DB,
                    useExisting: options.consume.db as never,
                },
                EventConsumerService
            );
        }
        return {
            module: MessagingModule,
            imports,
            providers,
            exports: [OutboxService],
        };
    }
}
