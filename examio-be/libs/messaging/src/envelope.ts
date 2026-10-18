import { ulid } from 'ulid';
import { z } from 'zod';
import { PermanentEventError } from './errors';
import { stateVersionField } from './state-event-types';

export const ENVELOPE_VERSION = 1;

export interface Envelope<T = unknown> {
    id: string;
    type: string;
    /** Envelope schema version (not the aggregate version). */
    version: 1;
    occurredAt: string;
    source: string;
    correlationId: string;
    data: T;
}

export interface EnvelopeContext {
    /** Publishing domain; must equal the first segment of the type. */
    source: string;
    correlationId?: string;
}

const envelopeSchema = z.object({
    id: z.string().regex(/^evt_/),
    type: z.string().min(1),
    version: z.number(),
    occurredAt: z.string().min(1),
    source: z.string().min(1),
    correlationId: z.string().min(1),
    data: z.unknown(),
});

/** The routing key's first segment is the owning domain. */
export function domainOf(routingKey: string): string {
    return routingKey.split('.')[0];
}

export function createEnvelope<T>(
    type: string,
    data: T,
    ctx: EnvelopeContext
): Envelope<T> {
    if (domainOf(type) !== ctx.source) {
        throw new Error(
            `Envelope source "${ctx.source}" must equal the domain of type "${type}"`
        );
    }
    const field = stateVersionField(type);
    if (field) {
        const value = (data as Record<string, unknown> | null)?.[field];
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            throw new Error(
                `State event "${type}" requires a numeric data.${field}`
            );
        }
    }
    return {
        id: `evt_${ulid()}`,
        type,
        version: ENVELOPE_VERSION,
        occurredAt: new Date().toISOString(),
        source: ctx.source,
        correlationId: ctx.correlationId ?? `cor_${ulid()}`,
        data,
    };
}

/** Validates an inbound payload; every failure is permanent (never retried). */
export function parseEnvelope(raw: unknown): Envelope {
    const parsed = envelopeSchema.safeParse(raw);
    if (!parsed.success) {
        throw new PermanentEventError(
            'INVALID_ENVELOPE',
            'Envelope failed schema validation'
        );
    }
    if (parsed.data.version !== ENVELOPE_VERSION) {
        throw new PermanentEventError(
            'UNSUPPORTED_VERSION',
            `Unsupported envelope version ${parsed.data.version}`
        );
    }
    return parsed.data as Envelope;
}
