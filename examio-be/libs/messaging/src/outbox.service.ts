import { Inject, Injectable } from '@nestjs/common';
import { createEnvelope, Envelope } from './envelope';
import { MESSAGING_OPTIONS, MessagingServiceOptions } from './messaging.constants';

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
        const envelope = createEnvelope(type, data, {
            source: this.options.service,
            correlationId,
        });
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
