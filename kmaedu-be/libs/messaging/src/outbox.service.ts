import { Inject, Injectable } from '@nestjs/common';
import { createEnvelope, domainOf, Envelope } from './envelope';
import { MESSAGING_OPTIONS, MessagingServiceOptions, publishedSources } from './messaging.constants';

/** Structural slice of a Prisma tx client: keeps this lib Prisma-free. */
export interface OutboxTx {
    outboxEvent: {
        create(args: {
            data: { id: string; source: string; type: string; envelope: object };
        }): Promise<unknown>;
    };
}

@Injectable()
export class OutboxService {
    constructor(
        @Inject(MESSAGING_OPTIONS) private readonly options: MessagingServiceOptions
    ) {}

    /**
     * Records an event inside the caller's transaction: it is published if and
     * only if the business write commits.
     */
    async add<T>(
        tx: OutboxTx,
        type: string,
        data: T,
        correlationId?: string
    ): Promise<Envelope<T>> {
        // The source is the event's own domain when this service is declared to publish it
        // (`alsoPublishes`); anything else keeps the service as source and fails the envelope
        // domain check, so no other domain can be forged.
        const domain = domainOf(type);
        const source = publishedSources(this.options).includes(domain)
            ? domain
            : this.options.service;
        const envelope = createEnvelope(type, data, { source, correlationId });
        await tx.outboxEvent.create({
            data: {
                id: envelope.id,
                source: envelope.source,
                type,
                envelope: envelope as unknown as object,
            },
        });
        return envelope;
    }
}
