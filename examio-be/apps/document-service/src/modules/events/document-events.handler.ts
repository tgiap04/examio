import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Envelope, EventHandler, PermanentEventError } from '@examio/messaging';
import { Prisma } from '../../prisma';
import { DocumentProcessingService } from '../upload/document-processing.service';

/** Mirrors proto `examio.events.v1.AiDocumentProcessed` (JSON uses the camelCase names). */
const processedSchema = z.object({
    storageId: z.string().min(1),
    pageCount: z.number().int().min(0).default(0),
});

/** Mirrors proto `examio.events.v1.AiDocumentFailed`. */
const failedSchema = z.object({
    storageId: z.string().min(1),
    reason: z.string().default(''),
});

function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, envelope: Envelope): T {
    const parsed = schema.safeParse(envelope.data);
    if (!parsed.success) {
        throw new PermanentEventError('INVALID_DATA', `${envelope.type} payload is invalid`);
    }
    return parsed.data;
}

/**
 * ai-service's verdicts on a document (queue `document.events`). Each runs in the consumer's
 * idempotency transaction: a replayed event id changes nothing, a finance outage on the refund
 * rolls the event back for the retry tier.
 */
@Injectable()
export class DocumentEventsHandler {
    constructor(private readonly processing: DocumentProcessingService) {}

    @EventHandler('ai.document.processed')
    async onProcessed(envelope: Envelope, tx: Prisma.TransactionClient): Promise<void> {
        const { storageId, pageCount } = parse(processedSchema, envelope);
        await this.processing.markProcessed(tx, storageId, pageCount);
    }

    @EventHandler('ai.document.failed')
    async onFailed(envelope: Envelope, tx: Prisma.TransactionClient): Promise<void> {
        const { storageId, reason } = parse(failedSchema, envelope);
        await this.processing.markFailed(tx, storageId, reason);
    }
}
